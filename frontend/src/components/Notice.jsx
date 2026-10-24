import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export function ErrorNotice({ message, onDismiss }) {
  if (!message) return null
  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">We could not load the data</p><p className="mt-1 break-words text-sm leading-6 text-rose-800">{message}</p><p className="mt-1 text-xs text-rose-700">Check that the FastAPI backend is running at http://127.0.0.1:8000, then refresh.</p></div>
      {onDismiss && <button onClick={onDismiss} aria-label="Dismiss error" className="rounded-lg p-1 text-rose-700 hover:bg-rose-100"><X size={15} /></button>}
    </div>
  )
}

export function InfoNotice({ title, children }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
      <Info size={17} className="mt-0.5 shrink-0 text-blue-600" />
      <div><p className="text-sm font-semibold text-slate-800">{title}</p><div className="mt-1 text-sm leading-6 text-slate-600">{children}</div></div>
    </div>
  )
}

export function SuccessNotice({ children }) {
  return <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} />{children}</div>
}
