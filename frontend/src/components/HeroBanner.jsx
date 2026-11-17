import { HeroScene } from './art'

// Wide banner with the full patriotic scene on the right and text on a dark fade on the left.
export function HeroBanner({ eyebrow, title, children, actions, height = 300, compact = false }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line" style={{ minHeight: height }}>
      <HeroScene className="absolute inset-0 h-full w-full" height={compact ? 420 : 520} chakraX={0.8} chakraY={compact ? 0.32 : 0.34} chakraSize={compact ? 0.95 : 1.15} />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/0" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg/70 to-transparent" aria-hidden />
      <div className="relative z-10 flex h-full max-w-[min(680px,62%)] flex-col justify-center gap-4 px-8 py-9 lg:px-12" style={{ minHeight: height }}>
        {eyebrow && (
          <p className="flex items-center gap-3 text-sm text-muted">
            <span className="h-5 w-[3px] rounded-full bg-gradient-to-b from-saffron via-india-white to-india-green" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[clamp(1.8rem,2.6vw,2.75rem)] leading-[1.1] font-semibold text-text">{title}</h1>
        {children && <div className="text-[15px] text-muted">{children}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </section>
  )
}
