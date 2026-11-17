// Phase report tooling: screenshots of the running app and HTML -> PDF, using headless Chrome over the DevTools protocol.
//   node tools.mjs shots <jobs.json>               take screenshots listed in a jobs file
//   node tools.mjs pdf <report.html> <out.pdf> <footer label>
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const CALL_TIMEOUT_MS = 90_000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch(extraFlags = []) {
  // A fresh port each run, so a leftover Chrome from an earlier run can never be picked up by mistake.
  const PORT = 9400 + Math.floor(Math.random() * 500)
  const profile = mkdtempSync(join(tmpdir(), 'kv-chrome-'))
  const proc = spawn(CHROME, ['--headless=new', ...(extraFlags.some((f) => f.startsWith('--use-angle')) ? [] : ['--disable-gpu']), '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...extraFlags, 'about:blank'], { stdio: 'ignore' })
  let target
  for (let i = 0; i < 75 && !target; i++) {
    await sleep(200)
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page')
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Headless Chrome did not start')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? rej(new Error(m.error.message)) : res(m.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method} timed out`)) }, CALL_TIMEOUT_MS)
    pending.set(id, { res: (v) => { clearTimeout(timer); res(v) }, rej: (e) => { clearTimeout(timer); rej(e) } })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const close = async () => {
    try { ws.close() } catch { /* ignore */ }
    // Kill the whole Chrome process tree on Windows; a plain kill can leave the browser running.
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    else proc.kill()
    await sleep(600)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
  }
  return { send, close }
}

// Signs in through the real API in demo mode (simulated codes), then stores the session like the app does.
function loginExpr(login) {
  const start = login.phone
    ? `post('/auth/survivor/start', { phone: ${JSON.stringify(login.phone)} })`
    : `post('/auth/staff/login', { username: ${JSON.stringify(login.username)}, password: 'kavach@123' })`
  return `(async () => {
    const post = (p, b) => fetch('/api' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const s = await ${start};
    const v = await post('/auth/verify', { challenge_id: s.challenge_id, code: s.demo_code });
    sessionStorage.setItem('kv_session', v.token);
    return v.user.role;
  })()`
}

async function shots(jobsPath) {
  const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'))
  const outDir = resolve(dirname(jobsPath), jobs.outDir)
  mkdirSync(outDir, { recursive: true })
  const { send, close } = await launch(jobs.flags ?? [])
  try {
    for (const s of jobs.shots) {
      const width = s.width ?? 1440
      const height = s.height ?? 900
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: Boolean(s.mobile) })
      await send('Page.navigate', { url: jobs.base + '/' })
      await sleep(1200)
      await send('Runtime.evaluate', { expression: 'sessionStorage.clear()' })
      if (s.login) {
        const r = await send('Runtime.evaluate', { expression: loginExpr(s.login), awaitPromise: true, returnByValue: true })
        if (r.exceptionDetails) throw new Error(`Login failed for ${s.file}`)
      }
      await send('Page.navigate', { url: jobs.base + s.path })
      await sleep(s.wait ?? 2000)
      const capture = async (file, full) => {
        if (full) {
          const m = await send('Page.getLayoutMetrics')
          const h = Math.min(3200, Math.ceil(m.cssContentSize?.height ?? m.contentSize.height))
          await send('Emulation.setDeviceMetricsOverride', { width, height: Math.max(height, h), deviceScaleFactor: 1, mobile: Boolean(s.mobile) })
          await sleep(500)
        }
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(join(outDir, file), Buffer.from(shot.data, 'base64'))
        if (full) await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: Boolean(s.mobile) })
        console.log('shot', file)
      }
      const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
        if (r.exceptionDetails) throw new Error(`step failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
        return r.result?.value
      }
      if (s.eval) { await evaluate(s.eval); await sleep(800) }
      // Optional scripted flow: fill forms, upload files, wait for conditions, take screenshots along the way.
      for (const st of s.steps ?? []) {
        if (st.eval) { await evaluate(st.eval); await sleep(st.after ?? 600) }
        if (st.type) {
          // Real typing, one character at a time, into the element the page has focused (or the one named).
          if (st.type.selector) await evaluate(`document.querySelector(${JSON.stringify(st.type.selector)}).focus()`)
          for (const ch of st.type.text) { await send('Input.insertText', { text: ch }); await sleep(st.type.delay ?? 15) }
          await sleep(300)
        }
        if (st.upload) {
          const { root } = await send('DOM.getDocument', { depth: 0 })
          const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: st.upload.selector })
          await send('DOM.setFileInputFiles', { nodeId, files: [resolve(dirname(jobsPath), st.upload.file)] })
        }
        if (st.waitFor) {
          const until = Date.now() + (st.timeout ?? 120_000)
          while (!(await evaluate(st.waitFor))) {
            if (Date.now() > until) throw new Error(`timed out waiting for: ${st.waitFor}`)
            await sleep(500)
          }
        }
        if (st.wait) await sleep(st.wait)
        if (st.navigate) { await send('Page.navigate', { url: jobs.base + st.navigate }); await sleep(st.after ?? 2000) }
        if (st.log) console.log(st.log, JSON.stringify(await evaluate(st.log)))
        if (st.pdf) {
          // Print the current page exactly as a user's "Save as PDF" would, for copy-paste and metadata checks.
          const r = await send('Page.printToPDF', { printBackground: true, transferMode: 'ReturnAsStream', paperWidth: 8.27, paperHeight: 11.69 })
          const chunks = []
          for (;;) {
            const part = await send('IO.read', { handle: r.stream, size: 1 << 20 })
            chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'))
            if (part.eof) break
          }
          await send('IO.close', { handle: r.stream })
          writeFileSync(join(outDir, st.pdf), Buffer.concat(chunks))
          console.log('pdf', st.pdf)
        }
        if (st.shot) await capture(st.shot, st.full)
      }
      if (s.file) await capture(s.file, s.full)
    }
  } finally {
    await close()
  }
}

async function pdf(htmlPath, outPath, label) {
  const { send, close } = await launch()
  try {
    await send('Page.navigate', { url: pathToFileURL(resolve(htmlPath)).href })
    await sleep(1500)
    const footer = `<div style="font-family:Segoe UI,sans-serif;font-size:8px;width:100%;padding:0 12mm;display:flex;justify-content:space-between;color:#7a6a64">`
      + `<span>Kavach · ${label}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
    // Stream the PDF back in chunks: large reports are too big for a single DevTools message.
    const r = await send('Page.printToPDF', {
      printBackground: true, paperWidth: 8.27, paperHeight: 11.69,
      marginTop: 0.45, marginBottom: 0.6, marginLeft: 0, marginRight: 0,
      displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: footer,
      transferMode: 'ReturnAsStream',
    })
    const chunks = []
    for (;;) {
      const part = await send('IO.read', { handle: r.stream, size: 1 << 20 })
      chunks.push(Buffer.from(part.data, part.base64Encoded ? 'base64' : 'utf8'))
      if (part.eof) break
    }
    await send('IO.close', { handle: r.stream })
    writeFileSync(outPath, Buffer.concat(chunks))
    console.log('pdf', outPath)
  } finally {
    await close()
  }
}

const [cmd, ...args] = process.argv.slice(2)
try {
  if (cmd === 'shots') await shots(args[0])
  else if (cmd === 'pdf') await pdf(args[0], args[1], args[2] ?? 'Phase report')
  else console.log('usage: node tools.mjs shots <jobs.json> | pdf <report.html> <out.pdf> <label>')
} catch (e) {
  console.error('error:', e.message)
  process.exitCode = 1
}
setTimeout(() => process.exit(), 1500) // the WebSocket can keep Node alive after Chrome is gone
