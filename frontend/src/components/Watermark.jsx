// A moving watermark with the viewer's badge, name and the time, laid over any revealed identity detail.
// It deters phone photos of the screen, and a photo that leaks still shows whose screen it was.
export function Watermark({ text }) {
  const rows = Array.from({ length: 8 })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <div className="kv-watermark absolute -inset-[40%] flex flex-col justify-around" style={{ transform: 'rotate(-18deg)' }}>
        {rows.map((_, i) => (
          <p key={i} className="font-mono text-sm whitespace-nowrap text-gold-soft/25" style={{ marginLeft: i % 2 ? '-6rem' : 0 }}>
            {Array.from({ length: 6 }).map(() => `${text}`).join('     ·     ')}
          </p>
        ))}
      </div>
    </div>
  )
}
