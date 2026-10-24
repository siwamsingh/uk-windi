import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, CalendarDays, Check, Download, Gauge,
  Info, RefreshCw, ShieldCheck, TrendingUp, Wind,
} from 'lucide-react'
import BrandHeader from './components/BrandHeader'
import ChartPanel from './components/ChartPanel'
import MetricCard from './components/MetricCard'
import MetricExplainer from './components/MetricExplainer'
import { ErrorNotice, InfoNotice } from './components/Notice'
import { fetchAccuracy, fetchActuals, fetchRollingAccuracy } from './lib/api'
import {
  addDays, formatDate, getCutoffForDeliveryDate, utcDateString,
} from './lib/dates'
import {
  averageValue, buildDailyTrend, buildHalfHourSeries,
  buildHourlySeries, calculateMetrics, selectedDayRows,
} from './lib/analytics'

function formatMw(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MW`
}

function formatMetric(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('en-GB', { maximumFractionDigits: 1 })} MW`
}

function formatCutoff(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'UTC',
  }).format(new Date(value)) + ' UTC'
}

function downloadCsv(rows, filename) {
  if (!rows?.length) return
  const columns = [
    ['timestamp', 'timestamp'],
    ['forecast', 'forecast_mw'],
    ['actual', 'actual_mw'],
    ['error', 'error_mw'],
    ['status', 'status'],
  ]
  const escape = (value) => {
    if (value === null || value === undefined) return ''
    const stringValue = String(value)
    return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue
  }
  const csv = [columns.map(([, heading]) => heading).join(','), ...rows.map((row) => columns.map(([key]) => escape(row[key])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const today = useMemo(() => utcDateString(), [])
  const tomorrow = useMemo(() => addDays(today, 1), [today])
  const [deliveryDate, setDeliveryDate] = useState(tomorrow)
  const [resolution, setResolution] = useState('hourly')
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [apiOnline, setApiOnline] = useState(false)
  const [error, setError] = useState('')
  const [accuracy, setAccuracy] = useState(null)
  const [actualResponse, setActualResponse] = useState(null)
  const [rollingAccuracy, setRollingAccuracy] = useState(null)
  const [lastUpdated, setLastUpdated] = useState('')
  const [cutoff, setCutoff] = useState('')

  const isUpcoming = deliveryDate > today
  const isToday = deliveryDate === today

  const reload = useCallback(() => setRefreshKey((key) => key + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    async function load() {
      setLoading(true)
      setError('')
      setApiOnline(false)
      const decisionTime = getCutoffForDeliveryDate(deliveryDate)
      if (alive) setCutoff(decisionTime)
      try {
        const requests = [fetchAccuracy(deliveryDate, decisionTime, controller.signal)]
        if (!isUpcoming) requests.push(fetchActuals(deliveryDate, controller.signal))
        const [nextAccuracy, nextActuals] = await Promise.all(requests)
        let nextRolling = null
        if (resolution === 'daily') {
          const trendEnd = isUpcoming ? addDays(deliveryDate, -1) : addDays(deliveryDate, 1)
          const trendStart = addDays(trendEnd, -14)
          nextRolling = await fetchRollingAccuracy(trendStart, trendEnd, controller.signal)
        }
        if (!alive) return
        setAccuracy(nextAccuracy)
        setActualResponse(nextActuals || null)
        setRollingAccuracy(nextRolling)
        setApiOnline(true)
        setLastUpdated(new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
        }).format(new Date()) + ' UTC')
      } catch (loadError) {
        if (loadError?.name === 'AbortError') return
        if (!alive) return
        setAccuracy(null)
        setActualResponse(null)
        setRollingAccuracy(null)
        setError(loadError?.message || 'Unexpected error while loading wind data.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => {
      alive = false
      controller.abort()
    }
  }, [deliveryDate, resolution, refreshKey, isUpcoming])

  const hourlySeries = useMemo(() => buildHourlySeries(accuracy), [accuracy])
  const halfHourSeries = useMemo(() => buildHalfHourSeries(accuracy, actualResponse), [accuracy, actualResponse])
  const chartData = useMemo(() => {
    if (resolution === '30min') return halfHourSeries
    if (resolution === 'daily') return buildDailyTrend(rollingAccuracy, accuracy, deliveryDate, isUpcoming)
    return hourlySeries
  }, [resolution, halfHourSeries, rollingAccuracy, accuracy, deliveryDate, isUpcoming, hourlySeries])

  const dailyRows = useMemo(() => selectedDayRows(accuracy, deliveryDate), [accuracy, deliveryDate])
  const metrics = useMemo(() => {
    const fromApi = accuracy && {
      mae_mw: accuracy.mae_mw,
      rmse_mw: accuracy.rmse_mw,
      bias_mw: accuracy.bias_mw,
      matched_intervals: accuracy.matched_intervals,
    }
    return fromApi || calculateMetrics(dailyRows)
  }, [accuracy, dailyRows])
  const meanForecast = useMemo(() => averageValue(dailyRows, 'forecast_mw'), [dailyRows])
  const meanActual = useMemo(() => averageValue(dailyRows, 'actual_mw'), [dailyRows])
  const completedIntervals = metrics?.matched_intervals ?? 0
  const targetDateLabel = formatDate(deliveryDate, { weekday: 'long' })

  const chartSourceNote = resolution === '30min'
    ? 'Actuals use 30-minute FUELHH intervals; each hourly forecast is held flat over its two half-hours. Accuracy cards remain hourly.'
    : resolution === 'daily'
      ? isUpcoming
        ? 'Trend includes the previous 14 complete delivery days and the selected upcoming forecast day.'
        : 'Trend covers the selected day and the 13 delivery days before it. Daily points show average MW.'
      : 'Forecasts and actuals are compared at hourly resolution; the actual is the mean of two half-hour intervals.'

  function handleResolutionChange(value) {
    setResolution(value)
  }

  function handleDateChange(event) {
    const value = event.target.value
    if (value && value <= tomorrow && value >= '2020-01-01') setDeliveryDate(value)
  }

  const exportRows = useMemo(() => {
    if (resolution === 'daily') return chartData.map((row) => ({
      timestamp: row.date,
      forecast: row.forecast,
      actual: row.actual,
      error: row.forecast !== null && row.actual !== null ? Math.round((row.forecast - row.actual) * 100) / 100 : null,
      status: row.status,
    }))
    return chartData.map((row) => ({
      timestamp: row.timestamp,
      forecast: row.forecast,
      actual: row.actual,
      error: row.error,
      status: row.status,
    }))
  }, [chartData, resolution])

  return (
    <div id="top" className="min-h-screen bg-[#f5f7fb] text-ink">
      <BrandHeader apiOnline={apiOnline} lastUpdated={lastUpdated} />

      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-7 sm:px-6 sm:pt-10 lg:px-10">
        <section className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div className="max-w-3xl">
            <p className="section-eyebrow"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> NATIONAL WIND GENERATION · GREAT BRITAIN</p>
            <h1 className="mt-3 text-[clamp(2.15rem,4vw,3.4rem)] font-bold leading-[1.06] tracking-[-0.045em] text-slate-950">See what the wind<br className="hidden sm:block" /> is likely to deliver.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
              Compare Elexon wind forecasts with what actually happened. Explore yesterday’s misses, understand forecast errors, or look ahead to the next delivery day.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <label htmlFor="delivery-date" className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Delivery date</label>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isUpcoming ? 'bg-blue-50 text-blue-700' : isToday ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {isUpcoming ? 'Upcoming' : isToday ? 'In progress' : 'Historical'}
              </span>
            </div>
            <div className="relative">
              <CalendarDays size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="delivery-date"
                type="date"
                min="2020-01-01"
                max={tomorrow}
                value={deliveryDate}
                onChange={handleDateChange}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {isUpcoming
                ? 'Showing the forecast for the next delivery day. Actual generation and error scores will appear after the day has happened.'
                : isToday
                  ? 'Showing today so far. Future hours may not have actual generation yet.'
                  : 'Showing the forecast made before this delivery day and comparing it with recorded generation.'}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Forecast cutoff</p>
                <p className="mt-1 text-xs font-semibold text-slate-700">{formatCutoff(cutoff)}</p>
              </div>
              <button onClick={reload} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>
        </section>

        <ErrorNotice message={error} onDismiss={() => setError('')} />

        {!error && !loading && apiOnline && isUpcoming && !dailyRows.some((row) => row.forecast_mw !== null && row.forecast_mw !== undefined) && (
          <div className="mb-5"><InfoNotice title="No forecast found for this cutoff">The API connected, but Elexon did not return a usable forecast for the selected delivery day by {formatCutoff(cutoff)}. Try refreshing or selecting another date. We will not fill missing forecasts with invented values.</InfoNotice></div>
        )}

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-eyebrow">YOUR SELECTED DELIVERY WINDOW</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{targetDateLabel}, {formatDate(deliveryDate)}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500"><ShieldCheck size={13} className="text-emerald-600" /> No future forecasts used</span>
            <button onClick={() => downloadCsv(exportRows, `wind-scope-${deliveryDate}-${resolution}.csv`)} disabled={!exportRows.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-40">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>

        <section aria-label="Wind generation metrics" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Average forecast" value={meanForecast} helper="Average predicted wind power for this day." tone="blue" icon={Wind} isUnavailable={!dailyRows.some((row) => row.forecast_mw !== null && row.forecast_mw !== undefined)} />
          <MetricCard label="Average actual" value={meanActual} helper="Average wind power that was recorded." tone="green" icon={Activity} isUnavailable={meanActual === null} />
          <MetricCard label="MAE" value={metrics?.mae_mw} helper={metrics?.mae_mw == null ? 'Needs matched forecasts and actuals.' : 'Typical size of the forecast mistake.'} tone="neutral" icon={Gauge} isUnavailable={metrics?.mae_mw == null} />
          <MetricCard label="RMSE" value={metrics?.rmse_mw} helper={metrics?.rmse_mw == null ? 'Available after actuals arrive.' : 'Gives extra weight to big mistakes.'} tone="neutral" icon={TrendingUp} isUnavailable={metrics?.rmse_mw == null} />
          <MetricCard label="Forecast bias" value={metrics?.bias_mw} helper={metrics?.bias_mw == null ? 'Available after actuals arrive.' : Number(metrics.bias_mw) > 0 ? 'Positive means the forecast was too high.' : Number(metrics.bias_mw) < 0 ? 'Negative means the forecast was too low.' : 'No average over- or under-forecast.'} tone={Number(metrics?.bias_mw) > 0 ? 'amber' : Number(metrics?.bias_mw) < 0 ? 'blue' : 'neutral'} icon={TrendingUp} isUnavailable={metrics?.bias_mw == null} />
        </section>

        <ChartPanel
          resolution={resolution}
          setResolution={handleResolutionChange}
          data={chartData}
          loading={loading}
          onRefresh={reload}
          deliveryDate={deliveryDate}
          isUpcoming={isUpcoming}
          dataSourceNote={chartSourceNote}
        />

        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-eyebrow">HOW TO READ THIS DAY</p>
                <h2 className="mt-1 text-base font-bold tracking-tight text-slate-900">A quick summary</h2>
              </div>
              <span className="rounded-xl bg-slate-100 p-2.5 text-slate-500"><Info size={17} /></span>
            </div>
            {isUpcoming ? (
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Elexon currently predicts an average of <strong className="font-semibold text-slate-900">{formatMw(meanForecast)}</strong> of wind power during this delivery day, based on the forecasts available by {formatCutoff(cutoff)}. Since this day has not happened yet, there is no actual generation to compare against and no honest error score to report. This is a generation forecast, not a recommendation for how much electricity to buy.
              </p>
            ) : (
              <p className="mt-4 text-sm leading-7 text-slate-600">
                For this delivery day, the average predicted wind generation was <strong className="font-semibold text-slate-900">{formatMw(meanForecast)}</strong>{meanActual !== null ? <> and the average recorded generation was <strong className="font-semibold text-slate-900">{formatMw(meanActual)}</strong>.</> : ', while some actual readings are not available yet.'} {metrics?.bias_mw != null ? (Number(metrics.bias_mw) > 0 ? <>The forecast was higher than actual generation on average by <strong className="font-semibold text-slate-900">{formatMetric(metrics.bias_mw)}</strong>.</> : Number(metrics.bias_mw) < 0 ? <>The forecast was lower than actual generation on average by <strong className="font-semibold text-slate-900">{formatMetric(Math.abs(metrics.bias_mw))}</strong>.</> : <>There was no average over- or under-forecast across the matched hours.</> ) : 'The error scores will appear when enough actual values and forecasts can be matched.'}
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Matched hours</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{completedIntervals} <span className="text-xs font-medium text-slate-400">/ 24</span></p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Forecast records</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{accuracy?.forecast_records_retrieved ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Actual records</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{accuracy?.actual_records_retrieved ?? actualResponse?.count ?? '—'}</p>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl bg-slate-900 p-5 text-white shadow-card sm:p-6">
            <div className="flex items-center gap-2 text-blue-300"><Wind size={18} /><p className="text-xs font-bold uppercase tracking-[0.12em]">A note on buying power</p></div>
            <h2 className="mt-3 text-lg font-bold tracking-tight">Forecasting wind is one piece of the puzzle.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">This dashboard predicts wind generation and scores the forecast. It does not decide the amount of electricity to buy, because that also depends on expected demand, contracted generation, imports, storage, reserve needs and market rules.</p>
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">
              <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
              <span>Missing forecasts stay missing. Scores are shown only when a forecast can be compared with actual data.</span>
            </div>
          </aside>
        </section>

        <MetricExplainer />

        <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>WindScope · National wind generation · Powered by Elexon BMRS data</p>
          <p>Decision cutoffs and chart dates use UTC. Forecasts use the latest eligible publication at or before the cutoff.</p>
        </footer>
      </main>
    </div>
  )
}
