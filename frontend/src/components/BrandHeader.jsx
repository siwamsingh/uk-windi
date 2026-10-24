import { Activity, ExternalLink, Wind } from 'lucide-react'

export default function BrandHeader({ apiOnline, lastUpdated }) {
  return (
    <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <a href="#top" className="flex items-center gap-3" aria-label="WindScope home">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <Wind size={21} strokeWidth={2.1} />
          </span>
          <span>
            <span className="block text-[15px] font-bold tracking-tight text-slate-900">WindScope</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400">UK generation intelligence</span>
          </span>
        </a>
        <div className="flex items-center gap-3 sm:gap-5">
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <Activity size={14} className="text-slate-400" />
            <span>{lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for data'}</span>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${apiOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${apiOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {apiOnline ? 'API connected' : 'API disconnected'}
          </span>
          <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900 md:flex">
            Elexon BMRS <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </header>
  )
}
