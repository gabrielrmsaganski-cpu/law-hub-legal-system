export const BUSINESS_TIMEZONE = import.meta.env.VITE_BUSINESS_TIMEZONE || 'America/Sao_Paulo'

function normalizeDateInput(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`)
  }
  return new Date(value)
}

function formatParts(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})
}

export function getBusinessDateString(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const parts = formatParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function formatBusinessDate(date, options = {}) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: BUSINESS_TIMEZONE, ...options }).format(normalizeDateInput(date))
}
