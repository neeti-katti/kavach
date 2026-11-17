import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { api } from '../api'
import { CopyDocument } from './police/RedactionStudio'

// The released public copy as a clean printable document. It is built only from redacted text,
// so printing it to PDF carries no hidden text layer, and the page sets no author or other metadata.
export default function PrintCopy() {
  const { copyId } = useParams()
  const navigate = useNavigate()
  const [copy, setCopy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/police/copies/${copyId}`).then((c) => { setCopy(c); document.title = `Public copy ${c.case_id}` }).catch((e) => setError(e.message))
    return () => { document.title = 'Kavach' }
  }, [copyId])

  return (
    <div className="min-h-full bg-[#E9E4DA] px-4 py-8 text-[#2A1D1A] print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-[820px] items-center justify-between print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-[#5A4A44] hover:text-black"><ArrowLeft size={16} aria-hidden />Back</button>
        {copy?.status === 'released' && (
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#7A1F24] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#8E2A2E]">
            <Printer size={16} aria-hidden />Print or save as PDF
          </button>
        )}
      </div>
      <article className="mx-auto max-w-[820px] bg-white px-14 py-12 shadow-[0_10px_40px_-12px_rgba(0,0,0,.35)] print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {error && <p className="text-[#8E2A2E]">{error}</p>}
        {copy && copy.status !== 'released' && <p className="text-[#8E2A2E]">This copy has not been released and cannot be printed.</p>}
        {copy?.status === 'released' && (
          <>
            <div className="h-1.5 bg-[linear-gradient(90deg,#FF9933_0_33.3%,#FFFFFF_33.3%_66.6%,#138808_66.6%)] ring-1 ring-[#E7DCCF]" />
            <header className="mt-6 flex items-start justify-between gap-6 border-b-2 border-[#D4AF37] pb-4">
              <div>
                <p className="text-xs font-semibold tracking-[.2em] text-[#7A1F24] uppercase">{copy.profile === 'court' ? 'Court copy' : 'Public copy'}</p>
                <h1 className="font-display mt-1 text-2xl font-semibold">First Information Report</h1>
              </div>
              <p className="text-right text-xs text-[#7A6A64]">Identity withheld to protect the survivor.<br />Risk score {copy.risk_score} · released</p>
            </header>
            <div className="mt-6"><CopyDocument header={copy.header} sections={copy.sections} plain /></div>
            <footer className="mt-10 border-t border-[#E7DCCF] pt-3 text-[11px] text-[#7A6A64]">
              The survivor's name, family, contact details, address, school or workplace and other identifying details have been withheld. Do not attempt to identify her.
            </footer>
          </>
        )}
      </article>
    </div>
  )
}
