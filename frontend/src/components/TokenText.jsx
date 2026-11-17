// Renders redacted text. Tokens such as [SURVIVOR_NAME] become gold labels ("Survivor A"); leak markers such as
// {{LEAK:school}} (used only in the comparison view) become red labels that name what was exposed without showing it.
const LABELS = {
  SURVIVOR_NAME: 'Survivor A',
  FATHER_NAME: "Survivor A's father",
  MOTHER_NAME: "Survivor A's mother",
  GUARDIAN_NAME: "Survivor A's guardian",
  RELATIVE_NAME: "a relative's name withheld",
  NAME: 'name withheld',
  PHONE: 'phone hidden',
  EMAIL: 'email hidden',
  ADDRESS: 'address hidden',
  PINCODE: 'pin code hidden',
  SCHOOL_OR_WORKPLACE: 'school / workplace hidden',
  ID_NUMBER: 'ID number hidden',
  NUMBER: 'number hidden',
  PLACE: 'locality withheld',
  COMMUNITY: 'community withheld',
  OCCUPATION: 'occupation withheld',
  AGE: 'age withheld',
  DOB: 'date of birth withheld',
  VEHICLE: 'vehicle number withheld',
  REDACTED: 'name removed',
}

export const LEAK_LABELS = {
  name: "survivor's name", father_name: "father's name", mother_name: "mother's name", guardian_name: "guardian's name",
  address: 'home address', phone: 'phone number', email: 'email', id_number: 'ID number', number: 'a long number',
  pincode: 'pin code', vehicle: 'vehicle number', dob: 'date of birth', school: 'school / workplace', place: 'village / locality',
  community: 'caste / community', occupation: "parent's job", age: 'exact age', relative_name: "a relative's name",
  other_name: 'a name', relation: 'relation to the accused',
}

const PILL = {
  gold: 'mx-0.5 rounded-md border border-gold/40 bg-gold/15 px-1.5 py-0.5 text-[0.86em] font-medium whitespace-nowrap text-gold-soft',
  leak: 'mx-0.5 rounded-md border border-danger/60 bg-danger/20 px-1.5 py-0.5 text-[0.86em] font-semibold whitespace-nowrap text-[#FFB4B5]',
  plain: 'mx-0.5 rounded bg-[#ECE6DC] px-1 text-[0.95em] font-semibold text-[#3A2A26]',
}

/** `plain` renders print-friendly labels for the public copy itself. */
export function TokenText({ text, className = '', plain = false, as: Tag = 'p' }) {
  if (!text) return null
  const parts = text.split(/(\[[A-Z_]+\]|\{\{LEAK:[a-z_]+\}\})/g)
  return (
    <Tag className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, i) => {
        const token = part.match(/^\[([A-Z_]+)\]$/)
        if (token) return <mark key={i} className={plain ? PILL.plain : PILL.gold}>{LABELS[token[1]] ?? token[1]}</mark>
        const leak = part.match(/^\{\{LEAK:([a-z_]+)\}\}$/)
        if (leak) return <mark key={i} className={PILL.leak}>⚠ {LEAK_LABELS[leak[1]] ?? leak[1]} exposed</mark>
        return <span key={i}>{part}</span>
      })}
    </Tag>
  )
}
