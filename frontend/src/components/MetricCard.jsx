import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

function formatMw(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MW`
}

export default function MetricCard({ label, value, helper, tone = 'neutral', icon: Icon, isUnavailable = false }) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    neutral: 'bg-slate-100 text-slate-600',
  }[tone] || 'bg-slate-100 text-slate-600'
  const display = isUnavailable ? '—' : formatMw(value)
  const BiasIcon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus
  return (
    <article className="metric-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-semibold text-slate-500">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          {label === 'Forecast bias' ? <BiasIcon size={17} /> : <Icon size={17} />}
        </span>
      </div>
      <div className="mt-3 text-[clamp(1.3rem,2vw,1.7rem)] font-bold tracking-tight text-slate-900">{display}</div>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{isUnavailable ? 'Available when the day has happened' : helper}</p>
    </article>
  )
}
