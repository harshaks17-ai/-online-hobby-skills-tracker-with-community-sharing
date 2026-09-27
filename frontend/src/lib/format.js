/** Formatting helpers shared by every view. Pure functions, no side effects. */

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** 95 -> "1h 35m", 45 -> "45m", 120 -> "2h" */
export function humanMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours && mins) return `${hours}h ${mins}m`
  if (hours) return `${hours}h`
  return `${mins}m`
}

export function hours(minutes) {
  return Math.round(((Number(minutes) || 0) / 60) * 10) / 10
}

export function compactNumber(value) {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

/** "just now" / "12m ago" / "3h ago" / "Tue" / "14 Mar" */
export function timeAgo(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 0) return 'just now'
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 6 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function longDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function shortDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function weekday(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { weekday: 'short' })
}

export function monthDay(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

export function isoDateOffset(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/** "in 12 days" / "3 days ago" / "today" */
export function relativeDay(value) {
  if (!value) return ''
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(target.getTime())) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((target - today) / DAY)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
}

export function percent(value, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round(((value || 0) / total) * 1000) / 10))
}

/** 12.5 -> "12.5", 13.0000004 -> "13". Whole numbers stay whole. */
export function percentLabel(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`
}

export function initials(name, fallback = '?') {
  if (!name) return fallback
  const parts = String(name).trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function bytes(size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there'
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 5) return 'Burning the midnight oil'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Winding down'
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** Deterministic pastel-ish colour from any string (used for tags/avatars). */
export function hashHue(value) {
  const str = String(value || '')
  let hash = 0
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % 360
}
