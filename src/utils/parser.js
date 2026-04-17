// Parses pasted flight confirmation text or informal descriptions
// Returns a partial flight object with whatever it can extract

const IATA_PATTERN = /\b([A-Z]{3})\b/g
const FLIGHT_NUMBER_PATTERN = /\b(AS|QX|HA|AA|BA|CX|JL|AY|IB|QF)\s*(\d{1,4})\b/gi
const DATE_PATTERNS = [
  // Apr 5, 2025 or April 5, 2025
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})\b/gi,
  // 4/5/2025 or 04/05/2025
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
  // 2025-04-05
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  // April 5 (no year — assume current year)
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/gi,
]

const MONTH_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
}

const CABIN_KEYWORDS = {
  saver: ['saver', 'basic economy', 'basic', 'wanna get away'],
  economy: ['main cabin', 'main', 'economy', 'coach', 'standard'],
  premium_economy: ['premium economy', 'premium class', 'premium'],
  business: ['business', 'business class', 'business select', 'first class business'],
  first: ['first class', 'first', 'transcontinental first'],
}

// Common non-airport 3-letter words to exclude
const EXCLUDED_CODES = new Set([
  'THE', 'AND', 'FOR', 'YOU', 'ARE', 'NOT', 'ALL', 'CAN', 'HAS', 'ITS',
  'ONE', 'HIS', 'HER', 'SHE', 'WAS', 'BUT', 'OUT', 'USE', 'OUR', 'WHO',
  'MAY', 'APR', 'JAN', 'FEB', 'MAR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT',
  'NOV', 'DEC', 'SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT',
  'EST', 'PST', 'MST', 'CST', 'PDT', 'MDT', 'CDT', 'EDT', 'UTC',
  'REF', 'NUM', 'VIA', 'USA', 'INC', 'LLC', 'TAX', 'FEE',
  'ETA', 'ETD', 'ARR', 'DEP',
])

function extractIATACodes(text) {
  const codes = []
  const matches = text.toUpperCase().matchAll(IATA_PATTERN)
  for (const match of matches) {
    const code = match[1]
    if (!EXCLUDED_CODES.has(code)) {
      codes.push(code)
    }
  }
  // Return unique codes preserving order
  return [...new Set(codes)]
}

function extractDate(text) {
  // Try "Apr 5, 2025" format
  const m1 = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})\b/i)
  if (m1) {
    const month = MONTH_MAP[m1[1].toLowerCase()]
    const day = parseInt(m1[2])
    const year = parseInt(m1[3])
    if (month !== undefined) return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Try "2025-04-05" format
  const m2 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`

  // Try "4/5/2025" format
  const m3 = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (m3) {
    const month = String(parseInt(m3[1])).padStart(2, '0')
    const day = String(parseInt(m3[2])).padStart(2, '0')
    return `${m3[3]}-${month}-${day}`
  }

  // Try "April 5" (no year)
  const m4 = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i)
  if (m4) {
    const month = MONTH_MAP[m4[1].toLowerCase()]
    const day = parseInt(m4[2])
    const year = new Date().getFullYear()
    if (month !== undefined) return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return null
}

function extractCabinClass(text) {
  const lower = text.toLowerCase()
  for (const [cabin, keywords] of Object.entries(CABIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cabin
    }
  }
  return null
}

function extractAirline(text) {
  const upper = text.toUpperCase()
  const m = text.match(/\b(AS|QX|HA|AA|BA|CX|JL|AY|IB|QF)\s*(\d{1,4})\b/i)
  if (!m) return null

  const airlineMap = {
    AS: 'alaska', QX: 'horizon', HA: 'hawaiian',
    AA: 'american', BA: 'british', CX: 'cathay',
    JL: 'jal', AY: 'finnair', IB: 'iberia', QF: 'qantas',
  }
  return {
    airline: airlineMap[m[1].toUpperCase()] || 'other_partner',
    flightNumber: `${m[1].toUpperCase()} ${m[2]}`,
  }
}

export function parseConfirmation(text) {
  if (!text || text.trim().length < 4) return {}

  const codes = extractIATACodes(text)
  const date = extractDate(text)
  const cabin = extractCabinClass(text)
  const airlineInfo = extractAirline(text)

  const result = {}

  if (codes.length >= 2) {
    result.origin = codes[0]
    result.destination = codes[1]
  } else if (codes.length === 1) {
    result.origin = codes[0]
  }

  if (date) result.date = date
  if (cabin) result.cabinClass = cabin
  if (airlineInfo) {
    result.airline = airlineInfo.airline
    result.flightNumber = airlineInfo.flightNumber
  }

  return result
}
