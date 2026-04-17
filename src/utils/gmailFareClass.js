// Searches Gmail for any airline confirmation email matching a given flight,
// then extracts the booking class letter.
// Works for Alaska, JAL, BA, AA, Cathay, or any airline — no sender restriction.

const BOOKING_CLASS_PATTERNS = [
  // "Booking class: M" / "Fare class: Y" / "Class: H"
  /(?:booking|fare|cabin|reservation|travel)\s+class[:\s]+([A-Z])\b/i,
  // "Class of service: Economy (M)"
  /class\s+of\s+service[^(]*\(([A-Z])\)/i,
  // Standalone "Class: M"
  /\bclass[:\s]+([A-Z])\b/i,
  // Fare basis starting with a class letter: "MLAXSEA" — first letter is class
  /\bfare\s+basis[:\s]+([A-Z])[A-Z0-9]+/i,
]

// Alaska/Horizon booking class → fareOption key
const ALASKA_CLASS_MAP = {
  J:'first_J', C:'first_C', D:'first_DI', I:'first_DI',
  Y:'economy_YB', B:'economy_YB',
  H:'economy_HK', K:'economy_HK',
  M:'economy_std', L:'economy_std', V:'economy_std', S:'economy_std',
  N:'economy_std', Q:'economy_std', O:'economy_std', G:'economy_std',
  X:'saver',
}

// Hawaiian booking class → fareOption key
const HAWAIIAN_CLASS_MAP = {
  F:'first_FJ', J:'first_FJ', P:'first_P', C:'first_CAD', A:'first_CAD', D:'first_CAD',
  Y:'economy_YWX', W:'economy_YWX', X:'economy_YWX',
  Q:'economy_QVBS', V:'economy_QVBS', B:'economy_QVBS', S:'economy_QVBS',
  N:'economy_std', M:'economy_std', I:'economy_std', H:'economy_std',
  G:'economy_std', K:'economy_std', L:'economy_std', Z:'economy_std', O:'economy_std',
  U:'saver',
}

// Generic partner cabin → fareOption key (when we can't match exact booking class)
const PARTNER_CABIN_KEYWORDS = [
  { pattern: /first\s+class|first\s+cabin/i,    fareOption: 'first' },
  { pattern: /business\s+class|business\s+cabin|executive/i, fareOption: 'business' },
  { pattern: /premium\s+economy|premium\s+class/i, fareOption: 'prem_economy' },
  { pattern: /economy\s+class|coach|economy/i,  fareOption: 'economy' },
]

function decodeBase64(str) {
  const fixed = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      Array.from(atob(fixed))
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
  } catch {
    try { return atob(fixed) } catch { return '' }
  }
}

function extractText(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64(plain.body.data)
    const html = payload.parts.find(p => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBase64(html.body.data).replace(/<[^>]+>/g, ' ')
    for (const part of payload.parts) {
      const t = extractText(part)
      if (t) return t
    }
  }
  return ''
}

async function gmailFetch(path, token) {
  const res = await fetch(`https://www.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

function detectBookingType(flightNumber, fromAddress) {
  const fn = (flightNumber || '').toUpperCase()
  const from = (fromAddress || '').toLowerCase()
  if (fn.startsWith('AS') || fn.startsWith('QX') || from.includes('alaskaair'))
    return 'alaska_direct'
  if (fn.startsWith('HA') || from.includes('hawaiianairlines'))
    return 'hawaiian_direct'
  return null // partner — caller decides based on booking context
}

export async function findFareClassForFlight(token, { flightNumber, date, origin, destination }) {
  if (!token || !flightNumber) return null

  // Search by flight number only — works for any airline's confirmation email
  const fn = flightNumber.replace(/\s+/g, '')       // "JL002"
  const fnSpaced = flightNumber.toUpperCase()        // "JL 002"

  // Broad subject filter + flight number — no sender restriction
  const query = `(subject:itinerary OR subject:confirmation OR subject:receipt OR subject:booking OR subject:"your trip") ("${fn}" OR "${fnSpaced}")`

  const searchResult = await gmailFetch(
    `/users/me/messages?maxResults=5&q=${encodeURIComponent(query)}`,
    token
  )
  if (!searchResult?.messages?.length) return null

  for (const msg of searchResult.messages) {
    const full = await gmailFetch(`/users/me/messages/${msg.id}?format=full`, token)
    if (!full) continue

    // Get sender address to help determine booking type
    const fromHeader = full.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || ''

    const text = extractText(full.payload)
    if (!text) continue

    // Try all booking class patterns
    let classLetter = null
    for (const pattern of BOOKING_CLASS_PATTERNS) {
      const m = text.match(pattern)
      if (m) { classLetter = m[1].toUpperCase(); break }
    }

    const bookingTypeHint = detectBookingType(flightNumber, fromHeader)

    if (classLetter) {
      // Map to fareOption based on airline
      let fareOption = null
      if (bookingTypeHint === 'alaska_direct') {
        fareOption = ALASKA_CLASS_MAP[classLetter]
      } else if (bookingTypeHint === 'hawaiian_direct') {
        fareOption = HAWAIIAN_CLASS_MAP[classLetter]
      } else {
        // Partner airline — use generic class mapping (first/business/economy)
        // J, C, D, I, F → first; Y, W, S, B, M → economy; etc.
        if ('JCDIAFP'.includes(classLetter)) fareOption = 'first'
        else if ('CDIZ'.includes(classLetter)) fareOption = 'business'
        else if ('YWBMSQ'.includes(classLetter)) fareOption = 'economy'
        else fareOption = 'economy'
      }

      if (fareOption) {
        return {
          classLetter,
          fareOption,
          bookingType: bookingTypeHint || null,
          source: 'gmail',
        }
      }
    }

    // No booking class letter found — try cabin keyword matching as fallback
    for (const { pattern, fareOption } of PARTNER_CABIN_KEYWORDS) {
      if (pattern.test(text)) {
        return {
          classLetter: null,
          fareOption,
          bookingType: bookingTypeHint || null,
          source: 'gmail_cabin_keyword',
        }
      }
    }
  }

  return null
}
