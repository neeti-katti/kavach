import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

const ToastContext = createContext(() => {})

const TONES = {
  success: { icon: CircleCheck, ring: 'border-ok/40', text: 'text-ok' },
  error: { icon: CircleAlert, ring: 'border-danger/50', text: 'text-danger' },
  info: { icon: Info, ring: 'border-gold/40', text: 'text-gold' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback((message, tone = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-3), { id, message, tone }])
    setTimeout(() => dismiss(id), 3800)
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-6 bottom-6 z-[100] flex print:hidden w-[min(380px,calc(100vw-3rem))] flex-col gap-2">
        {toasts.map((t) => {
          const tone = TONES[t.tone] ?? TONES.info
          const Icon = tone.icon
          return (
            <div key={t.id} role="status" className={`kv-toast card-glow pointer-events-auto flex items-start gap-3 rounded-xl border ${tone.ring} px-4 py-3 text-sm`}>
              <Icon size={18} className={`mt-0.5 shrink-0 ${tone.text}`} aria-hidden />
              <p className="flex-1 text-text">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-faint hover:text-text" aria-label="Dismiss"><X size={16} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
