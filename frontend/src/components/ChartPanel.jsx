import { useMemo } from 'react'
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { BarChart3, CalendarDays, Clock3, RefreshCw } from 'lucide-react'

const resolutionOptions = [
  { id: 'daily', label: 'Daily', icon: CalendarDays },
  { id: 'hourly', label: 'Hourly', icon: Clock3 },
  { id: '30min', label: '30 min', icon: BarChart3 },
]

function number(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'Not available'
    : `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MW`
}

function formatHourDate(timestamp, resolution) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (resolution === 'daily') {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  }
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })
}

function ChartTooltip({ active, payload, label, resolution }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div className="min-w-[200px] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {resolution === 'daily' ? formatHourDate(row.timestamp, resolution) : `${formatHourDate(row.timestamp, resolution)} UTC`}
      </p>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-5 text-sm">
          <span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" /> Predicted</span>
          <span className="font-semibold text-slate-900">{number(row.forecast)}</span>
        </div>
        <div className="flex items-center justify-between gap-5 text-sm">
          <span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Actual</span>
          <span className="font-semibold text-slate-900">{number(row.actual)}</span>
        </div>
        {row.error !== null && row.error !== undefined && (
          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Prediction minus actual: <span className={`font-semibold ${row.error >= 0 ? 'text-amber-700' : 'text-blue-700'}`}>{number(row.error)}</span>
          </div>
        )}
        {row.status && <p className="text-[11px] leading-4 text-slate-400">{row.status}</p>}
      </div>
    </div>
  )
}

export default function ChartPanel({
  resolution, setResolution, data, loading, onRefresh, deliveryDate, isUpcoming, dataSourceNote,
}) {
  const isDaily = resolution === 'daily'
  const shownData = useMemo(() => data || [], [data])
  const yDomain = useMemo(() => {
    const values = shownData.flatMap((row) => [row.forecast, row.actual]).filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
    if (!values.length) return ['auto', 'auto']
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max((max - min) * 0.12, max * 0.04, 100)
    return [Math.max(0, Math.floor((min - padding) / 500) * 500), Math.ceil((max + padding) / 500) * 500]
  }, [shownData])

  const chartData = shownData.map((row) => ({
    ...row,
    chartLabel: isDaily ? row.label : row.label || formatHourDate(row.timestamp, resolution),
  }))

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-7 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><BarChart3 size={17} /></span>
            <h2 className="text-base font-bold tracking-tight text-slate-900">Wind generation</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {isDaily ? 'Daily average power across a rolling two-week window.' : resolution === 'hourly' ? 'Hourly wind forecasts compared with observed generation.' : 'Half-hourly actuals with the hourly forecast held flat across each hour.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Chart resolution">
            {resolutionOptions.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setResolution(id)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${resolution === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} aria-pressed={resolution === id}>
                <Icon size={14} /> <span>{label}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh data" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="px-3 pb-2 pt-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-blue-500" /> Prediction</span>
            <span className="flex items-center gap-2"><span className="h-[3px] w-5 rounded-full bg-emerald-500" /> Actual</span>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isUpcoming ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
            {isUpcoming ? 'Prediction only' : 'Historical comparison'}
          </span>
        </div>
        <div className="relative h-[320px] w-full sm:h-[370px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/65 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><RefreshCw size={16} className="animate-spin" /> Loading Elexon data…</div>
            </div>
          )}
          {!loading && !chartData.some((row) => row.forecast !== null || row.actual !== null) ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><BarChart3 size={22} /></div>
              <h3 className="mt-4 text-sm font-semibold text-slate-800">No chart data for this date</h3>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">The API may not have a forecast published by the decision cutoff. Try another date or refresh the data.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 18, left: 6, bottom: 8 }}>
                <CartesianGrid stroke="#edf1f6" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="chartLabel" tick={{ fill: '#8a96a8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e7ecf2' }} minTickGap={isDaily ? 22 : 16} interval={isDaily ? 'preserveStartEnd' : resolution === '30min' ? 3 : 1} />
                <YAxis domain={yDomain} tick={{ fill: '#8a96a8', fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(value) => `${Math.round(value / 1000)}k`} />
                <Tooltip content={<ChartTooltip resolution={resolution} />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
                <Legend content={() => null} />
                <Line type="monotone" dataKey="forecast" name="Prediction" stroke="#3679e8" strokeWidth={2.6} dot={isDaily ? { r: 2.5, fill: '#3679e8', strokeWidth: 0 } : false} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke="#10a978" strokeWidth={2.6} dot={isDaily ? { r: 2.5, fill: '#10a978', strokeWidth: 0 } : false} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
                {isDaily && deliveryDate && <ReferenceLine x={new Date(`${deliveryDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} stroke="#94a3b8" strokeDasharray="4 4" />}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">{dataSourceNote}</p>
          <p className="shrink-0 text-[11px] font-medium text-slate-400">All timestamps shown in UTC</p>
        </div>
      </div>
    </section>
  )
}
