// Camera guard for police screens.
//
// Case information is shown only while the officer's webcam is on. The browser looks for a phone pointed at the
// screen (TensorFlow.js COCO-SSD, run on this computer) and blanks everything while one is in view. Video is never
// uploaded or recorded: the server only hears "camera on" every few seconds, and a short note when a phone is seen
// or the camera goes off. Without a recent "camera on" the server refuses police data, so blocking the camera hides
// everything, not just this page.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Camera, CameraOff, EyeOff, LoaderCircle, LogOut, RotateCcw, ScanFace, ShieldCheck, Smartphone, TriangleAlert } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { LogoTile } from './Logo'
import { Button } from './ui'

const DETECT_EVERY_MS = 450
const CLEAR_AFTER_MS = 3000     // the screen comes back this long after the phone was last seen
const HEARTBEAT_MS = 10000
const PHONE_SCORE = 0.5
const DARK_LUMA = 14            // average brightness (0-255) below which the camera counts as covered
const COVERED_AFTER_MS = 2500

// One detector worker for the whole tab, started the first time a police screen opens and kept for later screens.
const detector = { worker: null, state: 'loading', backend: null, listeners: new Set() }
function startDetector() {
  if (detector.worker) return detector
  try {
    detector.worker = new Worker(new URL('./phoneDetector.worker.js', import.meta.url), { type: 'module' })
  } catch {
    detector.state = 'unavailable'
    return detector
  }
  detector.worker.addEventListener('message', ({ data }) => {
    if (data.type === 'ready') { detector.state = 'ready'; detector.backend = data.backend }
    if (data.type === 'error') detector.state = 'unavailable'
    detector.listeners.forEach((fn) => fn(data))
  })
  detector.worker.addEventListener('error', () => {
    detector.state = 'unavailable'
    detector.listeners.forEach((fn) => fn({ type: 'error' }))
  })
  return detector
}

function brightness(video, canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let sum = 0
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  return sum / (px.length / 4)
}

const GATE = {
  starting: {
    icon: Camera, title: 'Turning on your camera',
    text: 'Allow camera access when your browser asks. Case information appears once the camera is on.',
  },
  denied: {
    icon: CameraOff, title: 'Camera required',
    text: 'Kavach shows case information only while your camera is on. Allow the camera for this site (the camera icon in the address bar), then try again.',
  },
  no_camera: {
    icon: CameraOff, title: 'No camera found',
    text: 'Connect a webcam to this computer, then try again. Case information is not shown without one.',
  },
  busy: {
    icon: CameraOff, title: 'Camera is in use',
    text: 'Another app is using the camera. Close it, then try again.',
  },
  unsupported: {
    icon: TriangleAlert, title: 'This browser cannot use a camera',
    text: 'Open Kavach in a current version of Chrome, Edge or Firefox over a secure (https) connection.',
  },
  lost: {
    icon: CameraOff, title: 'Your camera turned off',
    text: 'The screen was hidden because the camera stopped. Turn it back on to continue. Security has been told.',
  },
}

function Gate({ state, onRetry }) {
  const { signOut } = useAuth()
  const g = GATE[state] ?? GATE.starting
  const busy = state === 'starting'
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-bg px-6 py-10" role="alertdialog" aria-labelledby="cam-gate-title">
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <LogoTile size={92} />
        <span className={`grid h-16 w-16 place-items-center rounded-2xl border ${busy ? 'border-gold/40 bg-gold/10 text-gold' : 'border-danger/45 bg-danger/10 text-[#FFB4B5]'}`}>
          {busy ? <LoaderCircle size={30} className="animate-spin" aria-hidden /> : <g.icon size={30} aria-hidden />}
        </span>
        <div>
          <h1 id="cam-gate-title" className="font-display text-2xl font-semibold text-text">{g.title}</h1>
          <p className="mt-2 text-muted">{g.text}</p>
        </div>
        <p className="flex items-start gap-3 rounded-xl border border-gold/25 bg-gold/[.06] px-4 py-3 text-left text-sm text-muted">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden />
          The camera checks for phones pointed at the screen. Video stays on this computer. It is never uploaded or recorded.
        </p>
        {!busy && (
          <div className="flex flex-wrap justify-center gap-3">
            {state !== 'unsupported' && <Button icon={RotateCcw} onClick={onRetry}>{state === 'lost' ? 'Turn camera on' : 'Try again'}</Button>}
            <Button variant="secondary" icon={LogOut} onClick={async () => { await signOut(); window.location.assign('/') }}>Sign out</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function Blank({ reason }) {
  const phone = reason === 'phone'
  return (
    <div className="fixed inset-0 z-[150] grid place-items-center bg-bg px-6" role="alertdialog" aria-labelledby="cam-blank-title">
      <div className="flex max-w-lg flex-col items-center gap-5 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full border border-danger/50 bg-danger/10 text-[#FFB4B5]">
          {phone ? <Smartphone size={36} aria-hidden /> : <EyeOff size={36} aria-hidden />}
        </span>
        <h1 id="cam-blank-title" className="font-display text-3xl font-semibold text-text">Screen hidden</h1>
        <p className="text-lg text-muted">
          {phone
            ? 'A phone was seen pointing at this screen. Put it away and the screen comes back. Security has been told.'
            : 'Your camera looks covered. Uncover it and the screen comes back.'}
        </p>
      </div>
    </div>
  )
}

function Dock({ videoRef, detector, alarm, demo, onSimulate }) {
  const label = detector === 'ready' ? 'Phone check on' : detector === 'loading' ? 'Starting phone check…' : 'Phone check unavailable'
  return (
    <div className="fixed bottom-5 left-5 z-[160] flex items-center gap-3 rounded-2xl border border-line bg-[#150B0D]/95 p-2 pr-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,.8)] backdrop-blur print:hidden lg:left-[292px]">
      <video ref={videoRef} muted playsInline autoPlay aria-label="Your camera preview"
        className={`h-[60px] w-[80px] rounded-xl bg-black object-cover ring-1 ${alarm ? 'ring-danger' : 'ring-gold/40'}`} style={{ transform: 'scaleX(-1)' }} />
      <div className="text-xs leading-snug">
        <p className="flex items-center gap-1.5 font-medium text-text">
          <span className={`h-2 w-2 rounded-full ${alarm ? 'bg-danger' : 'bg-ok'} animate-pulse`} aria-hidden />Camera on
        </p>
        <p className={`mt-0.5 flex items-center gap-1.5 ${detector === 'unavailable' ? 'text-[#F3C27A]' : 'text-faint'}`}>
          <ScanFace size={13} aria-hidden />{label}
        </p>
        {demo && <button type="button" onClick={onSimulate} className="mt-1 text-gold-soft hover:underline">Simulate a phone (demo)</button>}
      </div>
    </div>
  )
}

export function CameraGuard({ children }) {
  const { pathname } = useLocation()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const pageRef = useRef(pathname)
  pageRef.current = pathname
  const detectorRef = useRef('loading')
  const lastPhone = useRef(0)
  const darkSince = useRef(0)
  const phoneRef = useRef(false)
  const statsRef = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [cam, setCam] = useState('starting')
  const [ready, setReady] = useState(false)
  const [detector, setDetector] = useState('loading')
  const [phone, setPhone] = useState(false)
  const [covered, setCovered] = useState(false)
  const [demo, setDemo] = useState(false)
  useEffect(() => { api('/demo/accounts').then(() => setDemo(true)).catch(() => {}) }, [])

  const report = useCallback((kind, score) => {
    api('/police/camera/event', { method: 'POST', body: { kind, page: pageRef.current, score } }).catch(() => {})
  }, [])

  const sighted = useCallback((score) => {
    lastPhone.current = Date.now()
    if (!phoneRef.current) {
      phoneRef.current = true
      setPhone(true)
      report('phone', score)
    }
  }, [report])

  // 1. Turn the camera on (again after "Try again").
  useEffect(() => {
    let cancelled = false
    setReady(false)
    if (!navigator.mediaDevices?.getUserMedia) { setCam('unsupported'); return }
    setCam('starting')
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        stream.getVideoTracks()[0]?.addEventListener('ended', () => { setCam('lost'); setReady(false); report('lost') })
        setCam('on')
      })
      .catch((e) => {
        if (cancelled) return
        const state = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'no_camera' : e?.name === 'NotReadableError' ? 'busy' : 'denied'
        setCam(state)
        report(state === 'busy' ? 'denied' : state)
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [attempt, report])

  // If she was blocked, come back by itself as soon as the browser setting changes to allow.
  useEffect(() => {
    if (cam !== 'denied' || !navigator.permissions?.query) return
    let status
    const onChange = () => { if (status.state === 'granted') setAttempt((a) => a + 1) }
    navigator.permissions.query({ name: 'camera' }).then((s) => { status = s; s.addEventListener('change', onChange) }).catch(() => {})
    return () => status?.removeEventListener('change', onChange)
  }, [cam])

  // 2. Show the preview and tell the server the camera is on, every few seconds.
  useEffect(() => {
    if (cam !== 'on') return
    const video = videoRef.current
    if (video && streamRef.current) { video.srcObject = streamRef.current; video.play().catch(() => {}) }
    let stop = false
    const beat = () => {
      const track = streamRef.current?.getVideoTracks()[0]
      if (!track || track.readyState !== 'live') return
      api('/police/camera/heartbeat', { method: 'POST', body: { detector: detectorRef.current } })
        .then(() => { if (!stop) setReady(true) })
        .catch(() => {})
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') beat() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('kavach:camera-check', beat)
    return () => {
      stop = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('kavach:camera-check', beat)
    }
  }, [cam])

  // 3. Look for a phone (in the detector worker) and a covered lens (here) a couple of times a second.
  useEffect(() => {
    if (cam !== 'on') return
    const d = startDetector()
    const setState = (s) => { detectorRef.current = s; setDetector(s) }
    setState(d.state)
    let busy = 0 // when the frame in the worker was sent; one at a time, so a slow computer simply checks less often
    const onMessage = (data) => {
      if (data.type === 'ready' || data.type === 'error') setState(d.state)
      if (data.type === 'result') {
        busy = 0
        statsRef.current = { backend: data.backend, ms: data.ms }
        if (data.phone >= PHONE_SCORE) sighted(data.phone)
      }
    }
    d.listeners.add(onMessage)
    const small = document.createElement('canvas')
    small.width = 32
    small.height = 24
    const frame = document.createElement('canvas')

    const timer = setInterval(() => {
      const v = videoRef.current
      const now = Date.now()
      try {
        if (v && v.readyState >= 2 && v.videoWidth) {
          const dark = brightness(v, small) < DARK_LUMA
          darkSince.current = dark ? darkSince.current || now : 0
          setCovered(dark && now - darkSince.current > COVERED_AFTER_MS)
          if (d.state === 'ready' && (!busy || now - busy > 15000)) {
            const scale = Math.min(1, 640 / v.videoWidth)
            frame.width = Math.round(v.videoWidth * scale)
            frame.height = Math.round(v.videoHeight * scale)
            const ctx = frame.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(v, 0, 0, frame.width, frame.height)
            const image = ctx.getImageData(0, 0, frame.width, frame.height)
            busy = now
            d.worker.postMessage({ type: 'frame', frame: image }, [image.data.buffer])
          }
        }
      } catch { busy = 0 /* a dropped frame; try again on the next tick */ }
      if (phoneRef.current && now - lastPhone.current > CLEAR_AFTER_MS) {
        phoneRef.current = false
        setPhone(false)
      }
    }, DETECT_EVERY_MS)
    return () => { clearInterval(timer); d.listeners.delete(onMessage) }
  }, [cam, sighted])

  // Demo only: lets a presenter show the blanking without holding up a phone.
  useEffect(() => {
    if (!demo) return
    window.kavachSimulatePhone = () => sighted(0.99)
    window.kavachCameraStats = () => statsRef.current
    return () => { delete window.kavachSimulatePhone; delete window.kavachCameraStats }
  }, [demo, sighted])

  const open = cam === 'on' && ready
  const hidden = phone || covered
  return (
    <>
      {open && <div className={`contents ${hidden ? 'invisible' : ''}`} aria-hidden={hidden || undefined}>{children}</div>}
      {!open && <Gate state={cam === 'on' ? 'starting' : cam} onRetry={() => setAttempt((a) => a + 1)} />}
      {open && hidden && <Blank reason={phone ? 'phone' : 'covered'} />}
      {cam === 'on' && <Dock videoRef={videoRef} detector={detector} alarm={hidden} demo={demo} onSimulate={() => sighted(0.99)} />}
    </>
  )
}
