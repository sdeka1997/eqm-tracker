// Gmail flight sync — single pass, all non-promotional emails sent to Gemini.
// Gemini extracts flight segments. PNR matched against existing confirmed flights.

import { calculateDistance } from './airports'
import { calculateFlightPoints, FARE_OPTIONS } from './calculations'

const VALID_AIRLINE_PREFIXES = new Set([
  'AS','QX','HA','AA','BA','CX','JL','AY','IB','QF','MH','UL','RJ','AT',
  'UA','DL','WN','B6','NK','F9','G4','SY','AC','WS','LH','AF','KL','SK',
  'SQ','NH','OZ','KE','MU','CA','CZ','EK','EY','QR','TK','LX','OS','AZ',
])

const CONFIRMATION_NUMBER_RE =
  /(?:confirmation|confirmation\s+(?:code|number)|record\s+locator|booking\s+(?:reference|code)|locator|pnr)[:\s#*]+([A-Z0-9]{5,8})\b/i

// ── Base64 / MIME ─────────────────────────────────────────────────────────────

function decodeBase64(str) {
  const fixed = str.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return decodeURIComponent(
      Array.from(atob(fixed)).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2,'0')).join('')
    )
  } catch { try { return atob(fixed) } catch { return '' } }
}

function collectParts(payload, acc = []) {
  if (!payload) return acc
  if (payload.body?.data) acc.push({ mimeType: payload.mimeType || '', data: payload.body.data })
  if (payload.parts) payload.parts.forEach(p => collectParts(p, acc))
  return acc
}

function extractText(payload) {
  const parts = collectParts(payload)
  const plain = parts.find(p => p.mimeType === 'text/plain')
  if (plain) return decodeBase64(plain.data)
  const html = parts.find(p => p.mimeType === 'text/html')
  if (html) return decodeBase64(html.data)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ').trim()
  return ''
}

function extractHtml(payload) {
  const parts = collectParts(payload)
  const html = parts.find(p => p.mimeType === 'text/html')
  return html ? decodeBase64(html.data) : ''
}

// ── Gmail API ─────────────────────────────────────────────────────────────────

async function gmailGet(path, token) {
  const res = await fetch(`https://www.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Gmail API error ${res.status}: ${body?.error?.message || res.statusText}`)
  }
  return res.json()
}

async function searchMessages(token, query) {
  const messages = []
  let pageToken = ''
  do {
    const url = `/users/me/messages?maxResults=500&q=${encodeURIComponent(query)}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const data = await gmailGet(url, token)
    if (data?.messages) messages.push(...data.messages)
    pageToken = data?.nextPageToken || ''
  } while (pageToken)
  return messages
}

// ── Gemini parsing ────────────────────────────────────────────────────────────

const BATCH_SIZE = 30

async function extractFlightsBatch(emails, geminiKey, { userName } = {}) {
  const numbered = emails.map((e, i) =>
    `--- EMAIL ${i} ---\n${e.text.slice(0, 2000)}`
  ).join('\n\n')

  const passengerClause = userName
    ? `The account holder's name is "${userName}" (may appear in different formats, e.g. all caps, last name first, or shortened). Prefer flights where this person is a passenger. If you cannot determine the passenger name from the email, still include the flight. Only skip a flight if you can clearly see it is for a different named passenger.`
    : `Include all flights found.`

  const prompt = `Extract flight information from each of the following emails.
Return a JSON object where each key is the email index (0, 1, 2...) and the value is an object with:
- "cancelled": true if this email indicates a booking cancellation, false otherwise
- "segments": an array of flight segments found in that email (use [] if cancelled or no flights found)

Each segment must have:
- "flightNumber": e.g. "AS 10" or "UA 234"
- "origin": 3-letter IATA airport code
- "destination": 3-letter IATA airport code
- "date": departure date as YYYY-MM-DD

Rules:
- ${passengerClause}
- Include all legs in a multi-segment itinerary for the account holder
- Use "segments": [] for emails with no qualifying flights

${numbered}`

  let res, attempts = 0
  while (true) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )
    if (res.ok) break
    const err = await res.json().catch(() => ({}))
    const msg = err?.error?.message || res.statusText
    if ((res.status === 429 || res.status === 503) && attempts < 3) {
      const retryMatch = msg.match(/retry in ([\d.]+)s/i)
      const waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) * 1000 + 1000 : 60000
      await new Promise(r => setTimeout(r, waitMs))
      attempts++
      continue
    }
    throw new Error(`Gemini API error ${res.status}: ${msg}`)
  }

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  try {
    const parsed = JSON.parse(raw)
    return emails.map((_, i) => {
      const entry = parsed[i] ?? parsed[String(i)] ?? {}
      const cancelled = entry.cancelled === true
      const rawSegs = Array.isArray(entry.segments) ? entry.segments : []
      const segments = rawSegs
        .filter(s => s.flightNumber && s.origin && s.destination && s.date)
        .map(s => ({
          flightNumber: s.flightNumber.toUpperCase().replace(/^([A-Z]{2})\s*(\d)/, '$1 $2'),
          origin: s.origin.toUpperCase(),
          destination: s.destination.toUpperCase(),
          date: s.date,
          prefix: s.flightNumber.slice(0, 2).toUpperCase(),
        }))
        .filter(s => VALID_AIRLINE_PREFIXES.has(s.prefix))
      return { cancelled, segments }
    })
  } catch {
    return emails.map(() => ({ cancelled: false, segments: [] }))
  }
}

function parseConfirmationNumber(text) {
  const m = text.match(CONFIRMATION_NUMBER_RE)
  return m ? m[1].toUpperCase() : null
}

// Returns true if every segment in newSegs already exists in existingSegs (reminder check).
function isSubset(newSegs, existingSegs) {
  if (newSegs.length === 0) return false
  const existingKeys = new Set(existingSegs.map(s => `${s.origin}|${s.destination}|${s.date}`))
  return newSegs.every(s => existingKeys.has(`${s.origin}|${s.destination}|${s.date}`))
}

// ── Main export ───────────────────────────────────────────────────────────────

// existingSegmentsByPNR: Map<pnr, {origin, destination, date}[]> — confirmed activities keyed by PNR.
// Used to detect reminders (subset) vs. genuine new/changed itineraries.
export async function syncFlightsFromGmail(token, geminiKey, { earningMethod, onProgress, userName, sinceDate, existingSegmentsByPNR = new Map() }) {
  onProgress?.({ step: 'Searching for emails…', current: 0, total: 0 })

  const afterClause = sinceDate
    ? `after:${sinceDate.replace(/-/g, '/')}`
    : `after:${new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10).replace(/-/g, '/')}`

  const query = `(flight OR itinerary OR trip OR reservation OR boarding) -category:promotions -category:social -category:forums ${afterClause}`
  const msgIds = await searchMessages(token, query)

  const total = msgIds.length
  onProgress?.({ step: 'Fetching emails…', current: 0, total })

  const emails = []
  for (const msg of msgIds) {
    const full = await gmailGet(`/users/me/messages/${msg.id}?format=full`, token)
    const headers = full.payload?.headers || []
    const text = extractText(full.payload)
    emails.push({
      id: msg.id,
      emailSubject: headers.find(h => h.name.toLowerCase() === 'subject')?.value || '',
      emailFrom: headers.find(h => h.name.toLowerCase() === 'from')?.value || '',
      text,
      emailHtml: extractHtml(full.payload),
      internalDate: parseInt(full.internalDate || '0'),
      pnr: parseConfirmationNumber(text),
    })
    onProgress?.({ step: `Fetching emails… (${emails.length}/${total})`, current: emails.length, total })
  }

  // Sort newest first so most recent email wins per PNR
  emails.sort((a, b) => b.internalDate - a.internalDate)

  // Keep the newest cancellation email per PNR + the newest non-cancellation email per PNR.
  // Cancellation emails are identified by subject keywords before hitting Gemini so they
  // aren't dropped by the regular dedup. No-PNR emails all pass through.
  const CANCELLATION_SUBJECT_RE = /\b(cancel|cancell|cancellation|refund|void)\b/i
  const seenCancelPNRs = new Set()
  const seenRegularPNRs = new Set()
  const dedupedEmails = []
  for (const email of emails) {
    if (email.pnr) {
      const isCancel = CANCELLATION_SUBJECT_RE.test(email.emailSubject)
      const seen = isCancel ? seenCancelPNRs : seenRegularPNRs
      if (seen.has(email.pnr)) continue
      seen.add(email.pnr)
    }
    dedupedEmails.push(email)
  }

  // Batch through Gemini
  const seenFlightKeys = new Set()
  const results = []

  for (let i = 0; i < dedupedEmails.length; i += BATCH_SIZE) {
    const batch = dedupedEmails.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batchTotal = Math.ceil(dedupedEmails.length / BATCH_SIZE)
    onProgress?.({ step: `Parsing emails (batch ${batchNum}/${batchTotal})…`, current: i, total: dedupedEmails.length })

    const batchResults = await extractFlightsBatch(batch, geminiKey, { userName })

    for (let j = 0; j < batch.length; j++) {
      const email = batch[j]
      const { cancelled, segments } = batchResults[j]
      const confNum = email.pnr

      // Cancellation email with no segments — flag existing activity rather than queuing
      if (cancelled && segments.length === 0 && confNum) {
        results.push({ type: 'cancellation', confirmationNumber: confNum })
        continue
      }

      if (segments.length === 0) continue

      // Reminder check: if all segments are already confirmed under this PNR, skip
      if (confNum && existingSegmentsByPNR.has(confNum)) {
        if (isSubset(segments, existingSegmentsByPNR.get(confNum))) continue
      }

      for (const seg of segments) {
        // Dedup key: PNR + route (no date) so a changed route on the same PNR replaces the old one;
        // fallback to flightNumber + date when there's no PNR
        const flightKey = confNum
          ? `${confNum}|${seg.origin}|${seg.destination}`
          : `${seg.flightNumber}|${seg.date}`
        if (seenFlightKeys.has(flightKey)) continue
        seenFlightKeys.add(flightKey)

        const isAlaskaFamily = ['AS','QX','HA'].includes(seg.prefix)
        const bookingType = isAlaskaFamily ? 'alaska_direct' : 'partner_direct'
        const fareOption = isAlaskaFamily ? 'economy_std' : 'economy'

        const dist = calculateDistance(seg.origin, seg.destination)
        const fareOpts = FARE_OPTIONS[bookingType] || []
        const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]
        const pts = calculateFlightPoints({ earningMethod, distanceMiles: dist || 0, bookingType, fareOption })

        results.push({
          type: 'flight',
          flightNumber: seg.flightNumber,
          origin: seg.origin,
          destination: seg.destination,
          date: seg.date,
          year: parseInt(seg.date.slice(0, 4)),
          distanceMiles: dist || 0,
          bookingType,
          fareOption,
          fareLabel: selectedFare?.label || '',
          multiplier: selectedFare?.multiplier || 1,
          fareSource: 'estimated',
          statusPoints: pts,
          confirmationNumber: confNum || null,
          importedFrom: 'gmail_sync',
          emailSubject: email.emailSubject || '',
          emailFrom: email.emailFrom || '',
          emailHtml: email.emailHtml || '',
        })
      }
    }
  }

  results.sort((a, b) => {
    if (a.type === 'cancellation') return 1
    if (b.type === 'cancellation') return -1
    return (a.date || '').localeCompare(b.date || '')
  })
  return results
}
