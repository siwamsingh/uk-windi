import { addDays, timestampToUtcDate } from './dates'

function numeric(value) {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

export function calculateMetrics(rows) {
  const complete = rows.filter((row) => numeric(row.forecast_mw) !== null && numeric(row.actual_mw) !== null)
  if (!complete.length) return { mae_mw: null, rmse_mw: null, bias_mw: null, matched_intervals: 0 }
  const errors = complete.map((row) => numeric(row.forecast_mw) - numeric(row.actual_mw))
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length
  const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length)
  const bias = errors.reduce((sum, value) => sum + value, 0) / errors.length
  return {
    mae_mw: round(mae),
    rmse_mw: round(rmse),
    bias_mw: round(bias),
    matched_intervals: complete.length,
  }
}

function round(value) {
  return Math.round(value * 100) / 100
}

export function buildHourlySeries(accuracy) {
  return (accuracy?.data || []).map((row) => ({
    timestamp: row.startTime,
    label: new Date(row.startTime).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
    }),
    forecast: numeric(row.forecast_mw),
    actual: numeric(row.actual_mw),
    error: numeric(row.error_mw),
    publishTime: row.forecast_publishTime,
    status: row.status,
    date: timestampToUtcDate(row.startTime),
  }))
}

export function buildHalfHourSeries(accuracy, actualResponse) {
  const actualMap = new Map()
  ;(actualResponse?.data || []).forEach((record) => {
    if (!record.startTime) return
    actualMap.set(new Date(record.startTime).getTime(), numeric(record.generation))
  })

  const output = []
  ;(accuracy?.data || []).forEach((hourRow) => {
    const hourTime = new Date(hourRow.startTime).getTime()
    for (const offsetMinutes of [0, 30]) {
      const timestamp = hourTime + offsetMinutes * 60_000
      const actual = actualMap.has(timestamp) ? actualMap.get(timestamp) : null
      const forecast = numeric(hourRow.forecast_mw)
      output.push({
        timestamp: new Date(timestamp).toISOString(),
        label: new Date(timestamp).toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
        }),
        forecast,
        actual,
        error: forecast !== null && actual !== null ? round(forecast - actual) : null,
        publishTime: hourRow.forecast_publishTime,
        status: forecast !== null && actual !== null ? 'Comparable (hourly forecast)' : 'Pending',
        date: timestampToUtcDate(new Date(timestamp).toISOString()),
      })
    }
  })
  return output
}

export function aggregateDaily(rows) {
  const byDate = new Map()
  rows.forEach((row) => {
    const date = row.date || (row.startTime ? timestampToUtcDate(row.startTime) : timestampToUtcDate(row.timestamp))
    if (!date) return
    if (!byDate.has(date)) byDate.set(date, { date, forecasts: [], actuals: [], completeHours: 0, totalHours: 0 })
    const bucket = byDate.get(date)
    const forecast = numeric(row.forecast_mw ?? row.forecast)
    const actual = numeric(row.actual_mw ?? row.actual)
    if (forecast !== null) bucket.forecasts.push(forecast)
    if (actual !== null) bucket.actuals.push(actual)
    if (forecast !== null && actual !== null) bucket.completeHours += 1
    bucket.totalHours += 1
  })

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((bucket) => {
    const forecast = average(bucket.forecasts)
    const actual = average(bucket.actuals)
    return {
      date: bucket.date,
      timestamp: `${bucket.date}T12:00:00Z`,
      label: new Date(`${bucket.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      forecast: forecast === null ? null : round(forecast),
      actual: actual === null ? null : round(actual),
      completeHours: bucket.completeHours,
      hoursWithForecast: bucket.forecasts.length,
      hoursWithActual: bucket.actuals.length,
      status: bucket.completeHours === 24 ? 'Complete day' : 'Partial or forecast-only day',
      dateCount: bucket.totalHours,
    }
  })
}

function average(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function selectedDayRows(accuracy, date) {
  return (accuracy?.data || []).filter((row) => timestampToUtcDate(row.startTime) === date)
}

export function buildDailyTrend(rollingAccuracy, selectedAccuracy, selectedDate, deliveryIsFuture) {
  const history = aggregateDaily(buildHourlySeries(rollingAccuracy))
  if (!deliveryIsFuture) return history

  const selectedRows = selectedDayRows(selectedAccuracy, selectedDate)
  const forecastValues = selectedRows.map((row) => numeric(row.forecast_mw)).filter((value) => value !== null)
  const forecastMean = average(forecastValues)
  const selectedPoint = {
    date: selectedDate,
    timestamp: `${selectedDate}T12:00:00Z`,
    label: new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    forecast: forecastMean === null ? null : round(forecastMean),
    actual: null,
    completeHours: 0,
    hoursWithForecast: forecastValues.length,
    hoursWithActual: 0,
    status: 'Upcoming forecast — actual not available yet',
  }
  return [...history.filter((row) => row.date !== selectedDate), selectedPoint].sort((a, b) => a.date.localeCompare(b.date))
}

export function averageValue(rows, key) {
  const values = rows.map((row) => numeric(row[key])).filter((value) => value !== null)
  return average(values)
}

export function toUtcDate(timestamp) {
  return timestamp ? addDays(timestampToUtcDate(timestamp), 0) : null
}
