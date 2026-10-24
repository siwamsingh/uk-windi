export function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return utcDateString(date)
}

export function startOfUtcDay(dateString) {
  return `${dateString}T00:00:00Z`
}

export function endOfUtcDay(dateString) {
  return `${addDays(dateString, 1)}T00:00:00Z`
}

export function noonUtc(dateString) {
  return `${dateString}T12:00:00Z`
}

export function getCutoffForDeliveryDate(deliveryDate, now = new Date()) {
  const previousDate = addDays(deliveryDate, -1)
  const standardCutoff = new Date(noonUtc(previousDate))
  const currentUtcDate = utcDateString(now)
  if (previousDate === currentUtcDate && now < standardCutoff) {
    return now.toISOString()
  }
  return standardCutoff.toISOString()
}

export function formatDate(dateString, options = {}) {
  if (!dateString) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...options,
  }).format(new Date(`${dateString}T00:00:00Z`))
}

export function formatTimestamp(timestamp, options = {}) {
  if (!timestamp) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: 'UTC', ...options,
  }).format(new Date(timestamp)) + ' UTC'
}

export function timestampToUtcDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export function dateWindow(dateString) {
  return { from: startOfUtcDay(dateString), to: endOfUtcDay(dateString) }
}
