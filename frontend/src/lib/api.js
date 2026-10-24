const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim()
const API_BASE = configuredBase.replace(/\/$/, '')

function makeUrl(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const base = `${API_BASE}${path}`
  return query.size ? `${base}?${query.toString()}` : base
}

async function requestJson(path, params, signal) {
  const response = await fetch(makeUrl(path, params), {
    headers: { Accept: 'application/json' },
    signal,
  })
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`The API returned an unreadable response (HTTP ${response.status}).`)
  }
  if (!response.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : `Request failed with HTTP ${response.status}.`
    throw new Error(detail)
  }
  return payload
}

export function fetchAccuracy(deliveryDate, decisionTime, signal) {
  return requestJson('/api/analysis/accuracy', {
    from: `${deliveryDate}T00:00:00Z`,
    to: `${addDaysSafe(deliveryDate, 1)}T00:00:00Z`,
    decision_time: decisionTime,
  }, signal)
}

export function fetchActuals(deliveryDate, signal) {
  return requestJson('/api/actuals/wind', {
    from: `${deliveryDate}T00:00:00Z`,
    to: `${addDaysSafe(deliveryDate, 1)}T00:00:00Z`,
  }, signal)
}

export function fetchRollingAccuracy(fromDate, toDateExclusive, signal) {
  return requestJson('/api/analysis/accuracy/day-ahead', {
    from: `${fromDate}T00:00:00Z`,
    to: `${toDateExclusive}T00:00:00Z`,
  }, signal)
}

function addDaysSafe(dateString, amount) {
  const value = new Date(`${dateString}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
