// Renders tokenised text, showing each hidden identity detail as a gold label instead of the raw token.
const LABELS = {
  SURVIVOR_NAME: 'Survivor A',
  FATHER_NAME: "Survivor A's father",
  MOTHER_NAME: "Survivor A's mother",
  GUARDIAN_NAME: "Survivor A's guardian",
  PHONE: 'phone hidden',
  EMAIL: 'email hidden',
  ADDRESS: 'address hidden',
  PINCODE: 'pin code hidden',
  SCHOOL_OR_WORKPLACE: 'school / workplace hidden',
  ID_NUMBER: 'ID number hidden',
  NUMBER: 'number hidden',
}

export function TokenText({ text, className = '' }) {
  if (!text) return null
  const parts = text.split(/(\[[A-Z_]+\])/g)
  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        const m = part.match(/^\[([A-Z_]+)\]$/)
        return m
          ? <mark key={i} className="mx-0.5 rounded-md border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[0.86em] font-medium whitespace-nowrap text-gold-soft">{LABELS[m[1]] ?? m[1]}</mark>
          : <span key={i}>{part}</span>
      })}
    </p>
  )
}
