// The Kavach logo is used exactly as supplied. Its light background sits on an ivory tile so it reads cleanly on dark screens.
export function LogoTile({ size = 160, className = '' }) {
  return (
    <div className={`relative shrink-0 rounded-2xl bg-[#FBF7F1] p-1.5 shadow-[0_0_0_1.5px_rgba(212,175,55,.75),0_18px_40px_-18px_rgba(212,175,55,.55)] ${className}`}
      style={{ width: size, height: size }}>
      <img src="/brand/kavach-logo.webp" alt="Kavach" className="h-full w-full rounded-xl object-contain" draggable="false" />
    </div>
  )
}
