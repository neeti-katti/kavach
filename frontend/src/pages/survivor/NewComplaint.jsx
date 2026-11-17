import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CircleCheck, EyeOff, FileImage, Languages, ListChecks, LockKeyhole, PenLine, RotateCcw, ScanLine, Send, Siren,
  Sparkles, Upload, Wand2,
} from 'lucide-react'
import { api } from '../../api'
import { TokenText } from '../../components/TokenText'
import { Button, Card, Field, inputClass } from '../../components/ui'
import { SAMPLE_DETAILS, samplePage } from '../../demoSamples'
import { LANGS, useLang } from '../../i18n'

const textareaClass = inputClass.replace('h-11', 'min-h-[132px] py-3 leading-relaxed')
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const EMPTY = {
  identity: { name: '', phone: '', email: '', address: '', pincode: '', father_name: '', mother_name: '', guardian_name: '', school_or_workplace: '', age: '' },
  incident: { date: '', time: '', locality: '', pincode: '', place: '' },
  accused: '',
  narrative: '',
  language: null,
  urgent: false,
  source: 'scan',
  scanImage: null,
  ocrText: '',
  ocrChecked: false,
}

// OCR runs inside the browser; the photo never leaves the device for reading. It reads Kannada, Hindi and English
// together, so the page is read correctly whatever language the screen is in. Language data is not cached.
async function readPage(dataUrl, onProgress) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('kan+hin+eng', 1, {
    cacheMethod: 'none',
    logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress) },
  })
  try {
    const { data } = await worker.recognize(dataUrl)
    return data.text.replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    await worker.terminate()
  }
}

function scriptOf(text) {
  const deva = (text.match(/[ऀ-ॿ]/g) ?? []).length
  const kann = (text.match(/[ಀ-೿]/g) ?? []).length
  if (Math.max(deva, kann) < 5) return 'en'
  return deva >= kann ? 'hi' : 'kn'
}

function digits(v) { return v.replace(/\D/g, '') }

function Steps({ steps, step, onJump }) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Steps">
      {steps.map((s, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo'
        return (
          <li key={s}>
            <button type="button" disabled={i >= step} onClick={() => onJump(i)} aria-current={state === 'current' ? 'step' : undefined}
              className={`flex w-full items-center gap-3 rounded-2xl border px-5 py-4 text-left ${state === 'current' ? 'border-gold/50 bg-gold/[.07]'
                : state === 'done' ? 'border-ok/30 bg-ok/[.05] hover:border-ok/60' : 'border-line bg-white/[.02]'}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display font-semibold ${state === 'current' ? 'bg-gold text-ink'
                : state === 'done' ? 'bg-ok/20 text-ok' : 'border border-line text-faint'}`}>
                {state === 'done' ? <CircleCheck size={18} aria-hidden /> : i + 1}
              </span>
              <span className={state === 'todo' ? 'text-muted' : 'font-medium text-text'}>{s}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export default function NewComplaint() {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [ocr, setOcr] = useState({ busy: false, progress: 0, error: '' })
  const [filling, setFilling] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sent, setSent] = useState(null)
  const [demo, setDemo] = useState(false)
  useEffect(() => { api('/demo/accounts').then(() => setDemo(true)).catch(() => {}) }, [])

  const complaintLang = form.language ?? lang
  const setId = (k) => (e) => setForm((f) => ({ ...f, identity: { ...f.identity, [k]: e.target.value } }))
  const setInc = (k) => (e) => setForm((f) => ({ ...f, incident: { ...f.incident, [k]: e.target.value } }))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const narrativeText = form.source === 'scan' ? form.ocrText : form.narrative
  const scanReady = form.scanImage && !ocr.busy && form.ocrText.trim().length >= 20

  function validate(s) {
    const e = {}
    const id = form.identity
    if (s === 0) {
      if (!form.scanImage || !form.ocrChecked || form.ocrText.trim().length < 20) e.scan = t.errScan
    }
    if (s === 1) {
      if (id.name.trim().length < 2) e.name = t.required
      if (digits(id.phone).length < 10) e.phone = t.errPhone
      if (id.address.trim().length < 5) e.address = t.required
      if (!/^\d{6}$/.test(id.pincode)) e.pincode = t.errPin
      const age = Number(id.age)
      if (!Number.isInteger(age) || age < 1 || age > 120) e.age = t.errAge
    }
    if (s === 2) {
      if (form.incident.locality.trim().length < 2) e.locality = t.required
      if (!/^\d{6}$/.test(form.incident.pincode)) e.incidentPin = t.errPin
      if (narrativeText.trim().length < 20) e.narrative = t.errNarrative
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function identityPayload() {
    const id = Object.fromEntries(Object.entries(form.identity).map(([k, v]) => [k, v.trim() || null]))
    return { ...id, age: Number(form.identity.age) }
  }

  // Fill empty fields from what the page says (and her phone from her sign-in). She checks everything next.
  async function fillFromText(text) {
    const r = await api('/survivor/extract', { method: 'POST', body: { text } })
    const pick = (current, found) => (current?.trim() ? current : found ?? current)
    setForm((f) => ({
      ...f,
      language: f.language ?? r.language,
      identity: Object.fromEntries(Object.entries(f.identity).map(([k, v]) => [k, pick(v, r.identity[k] ?? null)])),
      incident: Object.fromEntries(Object.entries(f.incident).map(([k, v]) => [k, pick(v, r.incident[k] ?? null)])),
    }))
    return r.found.length > 0
  }

  async function next() {
    if (!validate(step)) return
    if (step === 0) {
      setFilling(true)
      try { setPrefilled(await fillFromText(form.ocrText)) } catch { setPrefilled(false) } finally { setFilling(false) }
    }
    if (step === 2) {
      setPreview(null)
      try {
        setPreview(await api('/survivor/preview', {
          method: 'POST',
          body: { identity: identityPayload(), narrative: narrativeText, place: form.incident.place, accused: form.accused },
        }))
      } catch { setPreview({ narrative: null }) }
      setConfirmed(false)
    }
    setErrors({})
    setStep((s) => s + 1)
    window.scrollTo({ top: 0 })
  }

  async function typeInstead() {
    setForm((f) => ({ ...f, source: 'typed', scanImage: null, ocrText: '', ocrChecked: false }))
    setPrefilled(false)
    try { await fillFromText('-') } catch { /* phone stays empty; she types it */ }
    setErrors({})
    setStep(1)
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_PHOTO_BYTES) { setOcr({ busy: false, progress: 0, error: 'The photo is larger than 5 MB.' }); return }
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
    startReading(dataUrl)
  }

  async function useSamplePage(l) {
    startReading(await samplePage(l))
  }

  function startReading(dataUrl) {
    setForm((f) => ({ ...f, source: 'scan', scanImage: dataUrl, ocrText: '', ocrChecked: false, language: null }))
    runOcr(dataUrl)
  }

  async function runOcr(dataUrl = form.scanImage) {
    setOcr({ busy: true, progress: 0, error: '' })
    try {
      const text = await readPage(dataUrl, (p) => setOcr((o) => ({ ...o, progress: p })))
      setForm((f) => ({ ...f, ocrText: text, ocrChecked: false, language: scriptOf(text) }))
      setOcr({ busy: false, progress: 1, error: '' })
    } catch {
      setOcr({ busy: false, progress: 0, error: 'The page could not be read. Check your internet connection and try again, or type the complaint instead.' })
    }
  }

  function fillSample() {
    setForm((f) => ({ ...f, identity: { ...SAMPLE_DETAILS[lang].identity }, incident: { ...SAMPLE_DETAILS[lang].incident }, accused: SAMPLE_DETAILS[lang].accused }))
  }

  async function submit() {
    setSending(true)
    setSendError('')
    try {
      const r = await api('/survivor/complaints', {
        method: 'POST',
        body: {
          identity: identityPayload(),
          incident: {
            date: form.incident.date || null,
            time: form.incident.time || null,
            locality: form.incident.locality.trim(),
            pincode: form.incident.pincode,
            place: form.incident.place.trim() || null,
          },
          accused: form.accused.trim() || null,
          narrative: narrativeText.trim(),
          language: complaintLang,
          urgent: form.urgent,
          source: form.source,
          scan_image: form.source === 'scan' ? form.scanImage : null,
          ocr_text: form.source === 'scan' ? form.ocrText : null,
        },
      })
      setSent(r)
      setForm(EMPTY) // clear her details from memory as soon as they are safely stored
      window.scrollTo({ top: 0 })
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 py-10 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full border border-ok/40 bg-ok/10 text-ok"><CircleCheck size={40} aria-hidden /></span>
        <h1 className="font-display text-3xl font-semibold text-text">{t.sentTitle}</h1>
        <div className="card-glow rounded-2xl border border-gold/40 px-8 py-5">
          <p className="text-sm text-muted">{t.caseNumber}</p>
          <p className="mt-1 font-mono text-3xl tracking-wider text-gold-soft">{sent.id}</p>
        </div>
        <p className="max-w-xl text-lg text-muted">{t.sentText}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button icon={ListChecks} onClick={() => navigate('/survivor/status')}>{t.track}</Button>
          <Button variant="secondary" onClick={() => navigate('/survivor')}>{t.back}</Button>
        </div>
      </div>
    )
  }

  const id = form.identity
  const langName = LANGS.find((l) => l.id === complaintLang)?.name
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">{t.newTitle}</h1>
        <Link to="/survivor" className="flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft size={16} aria-hidden />{t.back}</Link>
      </div>

      <Steps steps={[t.stepUpload, t.stepAbout, t.stepWhat, t.stepReview]} step={step} onJump={setStep} />

      {step === 0 && (
        <Card className="p-6 lg:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-text">{t.uploadTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.uploadSub}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="f-scan" onChange={pickPhoto} />
          {!form.scanImage && (
            <div className="flex flex-col gap-4">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gold/35 bg-gold/[.03] p-8 text-center hover:border-gold/70">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gold/15 text-gold"><Upload size={30} aria-hidden /></span>
                <span className="text-lg font-semibold text-text">{t.scanPick}</span>
                <span className="max-w-md text-sm text-muted">{t.scanHint}</span>
              </button>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={typeInstead} className="flex items-center gap-2 text-sm text-gold-soft hover:underline">
                  <PenLine size={16} aria-hidden />{t.typeInstead}
                </button>
                {demo && (
                  <span className="flex flex-wrap gap-2">
                    {LANGS.map((l) => (
                      <Button key={l.id} type="button" size="sm" variant="ghost" icon={Sparkles} onClick={() => useSamplePage(l.id)}>Sample page: {l.name} (demo)</Button>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}
          {form.scanImage && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <figure className="overflow-hidden rounded-2xl border border-line bg-ink/60">
                <img src={form.scanImage} alt="Your complaint photo" className="max-h-[560px] w-full object-contain" />
              </figure>
              <div className="flex flex-col gap-3">
                {ocr.busy ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-white/[.02] p-6">
                    <ScanLine size={30} className="animate-pulse text-gold" aria-hidden />
                    <p className="text-text">{t.scanReading}</p>
                    <div className="h-2 w-64 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(ocr.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-gradient-to-r from-saffron to-gold transition-all" style={{ width: `${Math.max(4, ocr.progress * 100)}%` }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted">{t.scanCheck}</p>
                      {form.ocrText && <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-xs text-gold-soft"><Languages size={13} aria-hidden />{t.langFound}: {langName}</span>}
                    </div>
                    <textarea id="f-ocr" className={`${textareaClass} min-h-[320px]`} value={form.ocrText} lang={complaintLang}
                      onChange={(e) => setForm((f) => ({ ...f, ocrText: e.target.value, ocrChecked: false }))} />
                    <label className="flex items-center gap-3 text-sm text-text">
                      <input id="f-ocr-ok" type="checkbox" className="h-5 w-5 accent-[#D4AF37]" checked={form.ocrChecked} disabled={!scanReady}
                        onChange={(e) => setForm((f) => ({ ...f, ocrChecked: e.target.checked }))} />
                      {t.scanConfirm}
                    </label>
                  </>
                )}
                {ocr.error && <p role="alert" className="text-sm text-[#FFB4B5]">{ocr.error}</p>}
                <div className="flex flex-wrap gap-3">
                  <Button type="button" size="sm" variant="secondary" icon={FileImage} onClick={() => fileRef.current?.click()} disabled={ocr.busy}>{t.scanChange}</Button>
                  <Button type="button" size="sm" variant="ghost" icon={RotateCcw} onClick={() => runOcr()} disabled={ocr.busy}>{t.scanAgain}</Button>
                  <Button type="button" size="sm" variant="ghost" icon={PenLine} onClick={typeInstead} disabled={ocr.busy}>{t.typeInstead}</Button>
                </div>
              </div>
            </div>
          )}
          {errors.scan && <p className="mt-4 text-sm text-[#FF9C9E]">{errors.scan}</p>}
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-3">
            {prefilled && (
              <p className="flex items-start gap-3 rounded-xl border border-ok/35 bg-ok/[.07] px-4 py-3 text-sm text-text">
                <Wand2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden />{t.prefilled}
              </p>
            )}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="flex flex-1 items-start gap-3 rounded-xl border border-gold/25 bg-gold/[.06] px-4 py-3 text-sm text-muted">
                <LockKeyhole size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden />{t.aboutHint}
              </p>
              {demo && form.source === 'typed' && <Button type="button" size="sm" variant="ghost" icon={Sparkles} onClick={fillSample}>Fill sample details (demo)</Button>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2"><Field label={t.fName} id="f-name" error={errors.name}><input id="f-name" className={inputClass} autoComplete="off" value={id.name} onChange={setId('name')} /></Field></div>
            <Field label={t.fAge} id="f-age" error={errors.age}><input id="f-age" className={inputClass} inputMode="numeric" value={id.age} onChange={setId('age')} /></Field>
            <Field label={t.fPhone} id="f-phone" error={errors.phone}><input id="f-phone" className={inputClass} inputMode="numeric" autoComplete="off" value={id.phone} onChange={setId('phone')} /></Field>
            <div className="md:col-span-2 xl:col-span-3"><Field label={t.fAddress} id="f-address" error={errors.address}><input id="f-address" className={inputClass} autoComplete="off" value={id.address} onChange={setId('address')} /></Field></div>
            <Field label={t.fPincode} id="f-pincode" error={errors.pincode}><input id="f-pincode" className={inputClass} inputMode="numeric" maxLength={6} value={id.pincode} onChange={setId('pincode')} /></Field>
            <Field label={t.fFather} id="f-father"><input id="f-father" className={inputClass} autoComplete="off" value={id.father_name} onChange={setId('father_name')} /></Field>
            <Field label={t.fMother} id="f-mother"><input id="f-mother" className={inputClass} autoComplete="off" value={id.mother_name} onChange={setId('mother_name')} /></Field>
            <div className="md:col-span-2"><Field label={t.fGuardian} id="f-guardian"><input id="f-guardian" className={inputClass} autoComplete="off" value={id.guardian_name} onChange={setId('guardian_name')} /></Field></div>
            <div className="md:col-span-2"><Field label={t.fSchool} id="f-school"><input id="f-school" className={inputClass} autoComplete="off" value={id.school_or_workplace} onChange={setId('school_or_workplace')} /></Field></div>
            <div className="md:col-span-2"><Field label={t.fEmail} id="f-email"><input id="f-email" type="email" className={inputClass} autoComplete="off" value={id.email} onChange={setId('email')} /></Field></div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-6">
          <Card className="p-6 lg:p-8">
            <h2 className="mb-5 text-lg font-semibold text-text">{t.incidentDetails}</h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              <Field label={t.fDate} id="f-date"><input id="f-date" type="date" className={inputClass} value={form.incident.date} onChange={setInc('date')} /></Field>
              <Field label={t.fTime} id="f-time"><input id="f-time" type="time" className={inputClass} value={form.incident.time} onChange={setInc('time')} /></Field>
              <Field label={t.fLocality} id="f-locality" error={errors.locality}><input id="f-locality" className={inputClass} value={form.incident.locality} onChange={setInc('locality')} /></Field>
              <Field label={t.fIncidentPin} id="f-incident-pin" error={errors.incidentPin}><input id="f-incident-pin" className={inputClass} inputMode="numeric" maxLength={6} value={form.incident.pincode} onChange={setInc('pincode')} /></Field>
              <div className="md:col-span-2 xl:col-span-4"><Field label={t.fPlace} id="f-place"><input id="f-place" className={inputClass} value={form.incident.place} onChange={setInc('place')} /></Field></div>
              <div className="md:col-span-2 xl:col-span-4"><Field label={t.fAccused} id="f-accused"><textarea id="f-accused" className={textareaClass} rows={3} value={form.accused} onChange={set('accused')} /></Field></div>
            </div>
          </Card>

          <Card className="p-6 lg:p-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text">{t.fNarrative}</h2>
                <p className="text-sm text-muted">{form.source === 'scan' ? t.scanCheck : t.whatHint}</p>
              </div>
              {form.source === 'typed' && (
                <div role="group" aria-label={t.fLanguage} className="flex rounded-xl border border-line p-1">
                  {LANGS.map((l) => (
                    <button key={l.id} type="button" onClick={() => setForm((f) => ({ ...f, language: l.id }))} aria-pressed={complaintLang === l.id}
                      className={`h-9 rounded-lg px-3 text-sm ${complaintLang === l.id ? 'bg-surface-2 text-gold-soft ring-1 ring-gold/40' : 'text-muted hover:text-text'}`}>{l.name}</button>
                  ))}
                </div>
              )}
            </div>
            {form.source === 'typed' ? (
              <Field label={t.fNarrative} id="f-narrative" hint={t.narrativeHint} error={errors.narrative}>
                <textarea id="f-narrative" className={textareaClass} rows={9} value={form.narrative} onChange={set('narrative')} lang={complaintLang} />
              </Field>
            ) : (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <img src={form.scanImage} alt="Your complaint photo" className="max-h-[360px] w-full rounded-xl border border-line bg-ink/60 object-contain" />
                <Field label={t.fNarrative} id="f-ocr2" error={errors.narrative}>
                  <textarea id="f-ocr2" className={`${textareaClass} min-h-[300px]`} value={form.ocrText} lang={complaintLang}
                    onChange={(e) => setForm((f) => ({ ...f, ocrText: e.target.value }))} />
                </Field>
              </div>
            )}
          </Card>

          <label className={`flex cursor-pointer items-start gap-4 rounded-2xl border px-6 py-5 ${form.urgent ? 'border-danger/60 bg-danger/[.12]' : 'border-danger/30 bg-danger/[.04] hover:bg-danger/[.08]'}`}>
            <input id="f-urgent" type="checkbox" className="mt-1 h-5 w-5 accent-[#E5484D]" checked={form.urgent} onChange={(e) => setForm((f) => ({ ...f, urgent: e.target.checked }))} />
            <span>
              <span className="flex items-center gap-2 font-semibold text-text"><Siren size={18} className="text-[#FFB4B5]" aria-hidden />{t.urgent}</span>
              <span className="mt-1 block text-sm text-muted">{t.urgentHint}</span>
            </span>
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="flex flex-col gap-6 xl:col-span-7">
            <Card className="p-6 lg:p-7">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">{t.yourDetails}</h2>
                <button type="button" className="text-sm text-gold-soft hover:underline" onClick={() => setStep(1)}>{t.edit}</button>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
                {[[t.fName, id.name], [t.fAge, id.age], [t.fPhone, id.phone], [t.fAddress, `${id.address}, ${id.pincode}`], [t.fFather, id.father_name],
                  [t.fMother, id.mother_name], [t.fGuardian, id.guardian_name], [t.fSchool, id.school_or_workplace], [t.fEmail, id.email]]
                  .filter(([, v]) => v && String(v).trim())
                  .map(([k, v]) => (<div key={k} className="contents"><dt className="text-faint">{k}</dt><dd className="text-text">{v}</dd></div>))}
              </dl>
            </Card>
            <Card className="p-6 lg:p-7">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">{t.incidentDetails}</h2>
                <button type="button" className="text-sm text-gold-soft hover:underline" onClick={() => setStep(2)}>{t.edit}</button>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
                {[[t.fDate, form.incident.date], [t.fTime, form.incident.time], [t.fLocality, `${form.incident.locality} (${form.incident.pincode})`],
                  [t.fPlace, form.incident.place], [t.fAccused, form.accused]]
                  .filter(([, v]) => v && String(v).trim())
                  .map(([k, v]) => (<div key={k} className="contents"><dt className="text-faint">{k}</dt><dd className="text-text">{v}</dd></div>))}
              </dl>
              <div className="gold-divider my-5" />
              <p className="mb-2 text-sm text-faint">{t.fNarrative}{form.source === 'scan' ? ` · ${t.modeScan}` : ''}</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-text">{narrativeText}</p>
            </Card>
          </div>

          <div className="flex flex-col gap-6 xl:col-span-5">
            <Card className="border-gold/30 p-6 lg:p-7">
              <h2 className="flex items-center gap-2.5 text-lg font-semibold text-text"><EyeOff size={20} className="text-gold" aria-hidden />{t.officerSees}</h2>
              <p className="mt-1 text-sm text-muted">{t.officerSeesHint}</p>
              <div className="gold-divider my-5" />
              {!preview ? <p className="text-sm text-faint">…</p> : (
                <div className="flex flex-col gap-4 text-sm leading-relaxed text-text">
                  <TokenText text={preview.narrative} />
                  {preview.place && <p className="text-muted"><span className="text-faint">{t.fPlace} </span><TokenText text={preview.place} className="inline" /></p>}
                </div>
              )}
            </Card>
            <Card className="p-6 lg:p-7">
              {form.urgent && <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#FFB4B5]"><Siren size={17} aria-hidden />{t.urgent}</p>}
              <label className="flex items-start gap-3 text-sm text-text">
                <input id="f-confirm" type="checkbox" className="mt-0.5 h-5 w-5 accent-[#D4AF37]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                {t.confirmCorrect}
              </label>
              <Button className="mt-5 w-full" size="lg" icon={Send} disabled={!confirmed || sending} onClick={submit}>{sending ? t.sending : t.submit}</Button>
              {sendError && <p role="alert" className="mt-3 text-sm text-[#FFB4B5]">{sendError}</p>}
            </Card>
          </div>
        </div>
      )}

      {step < 3 && (
        <div className="flex items-center justify-between gap-4">
          <Button variant="secondary" icon={ArrowLeft} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t.back}</Button>
          <Button iconRight={ArrowRight} onClick={next} disabled={ocr.busy || filling}>{filling ? t.filling : t.next}</Button>
        </div>
      )}
      {step === 3 && (
        <div><Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(2)}>{t.back}</Button></div>
      )}
    </div>
  )
}
