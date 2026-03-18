const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Sao_Paulo';

function formatParts(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
}

function getBusinessDateString(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  const parts = formatParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function compareDateOnly(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isDateBefore(a, b) {
  return compareDateOnly(a, b) < 0;
}

function isDateOnOrBefore(a, b) {
  return compareDateOnly(a, b) <= 0;
}

module.exports = {
  BUSINESS_TIMEZONE,
  getBusinessDateString,
  compareDateOnly,
  isDateBefore,
  isDateOnOrBefore,
};
