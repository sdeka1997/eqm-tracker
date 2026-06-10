// Gmail flight sync — single pass, all non-promotional emails sent to Gemini.
// Gemini extracts flight segments. PNR matched against existing confirmed flights.

import { calculateDistance } from './airports'
import { calculateFlightPoints, FARE_OPTIONS } from './calculations'

const VALID_AIRLINE_PREFIXES = new Set([
  'AS','QX','HA','AA','BA','CX','JL','AY','IB','QF','MH','UL','RJ','AT',
  'UA','DL','WN','B6','NK','F9','G4','SY','AC','WS','LH','AF','KL','SK',
  'SQ','NH','OZ','KE','MU','CA','CZ','EK','EY','QR','TK','LX','OS','AZ',
])

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

// Strip style/script/img from HTML before sending to Gemini. Preserves table
// structure and text content so Gemini can reliably find confirmation codes,
// flight numbers, etc. that live inside table cells in airline emails.
function prepareHtmlForGemini(html) {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
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

const BATCH_SIZE = 10

async function extractFlightsBatch(emails, geminiKey, { userName } = {}) {
  const numbered = emails.map((e, i) =>
    `--- EMAIL ${i} ---\nFrom: ${e.emailFrom}\nSubject: ${e.emailSubject}\n${prepareHtmlForGemini(e.emailHtml) || e.text}`
  ).join('\n\n')

  const passengerClause = userName
    ? `The account holder's name is "${userName}" (may appear in different formats, e.g. all caps, last name first, or shortened). Prefer flights where this person is a passenger. If you cannot determine the passenger name from the email, still include the flight. Only skip a flight if you can clearly see it is for a different named passenger.`
    : `Include all flights found.`

  const prompt = `Extract flight information from each of the following emails.
Return a JSON object where each key is the email index (0, 1, 2...) and the value is an object with:
- "cancelled": true if this email indicates a booking cancellation, false otherwise
- "confirmationNumbers": an array of all booking confirmation codes, PNRs, or record locators found in the email (e.g. ["ABC123", "XYZ789"]). Use [] if none found. List the code associated with the sender's airline first — for codeshare emails with multiple codes, include all of them.
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
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
      const confirmationNumbers = (Array.isArray(entry.confirmationNumbers) ? entry.confirmationNumbers : [])
        .map(c => typeof c === 'string' ? c.trim().toUpperCase() : null)
        .filter(Boolean)
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
      return { cancelled, confirmationNumbers, segments }
    })
  } catch {
    return emails.map(() => ({ cancelled: false, confirmationNumbers: [], segments: [] }))
  }
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

  const FETCH_CONCURRENCY = 10
  const emails = []
  for (let i = 0; i < msgIds.length; i += FETCH_CONCURRENCY) {
    const chunk = msgIds.slice(i, i + FETCH_CONCURRENCY)
    const results = await Promise.all(chunk.map(async (msg) => {
      const full = await gmailGet(`/users/me/messages/${msg.id}?format=full`, token)
      const headers = full.payload?.headers || []
      return {
        id: msg.id,
        emailSubject: headers.find(h => h.name.toLowerCase() === 'subject')?.value || '',
        emailFrom: headers.find(h => h.name.toLowerCase() === 'from')?.value || '',
        text: extractText(full.payload),
        emailHtml: extractHtml(full.payload),
        internalDate: parseInt(full.internalDate || '0'),
      }
    }))
    emails.push(...results)
    onProgress?.({ step: `Fetching emails… (${emails.length}/${total})`, current: emails.length, total })
  }

  // Sort oldest-first: the earliest booking email's PNR becomes the primary stored PNR.
  // Newer emails for the same booking overwrite segments (catches schedule changes) and
  // accumulate any additional PNR codes (catches codeshare partner confirmations).
  emails.sort((a, b) => a.internalDate - b.internalDate)

  const seenCancelPNRs = new Set()
  const seenFlightKeys = new Set()
  const results = []
  const debugLog = []

  // Maps any PNR code → the mutable booking object it belongs to. Allows later
  // emails to accumulate new PNR codes and overwrite segments on the same booking.
  // booking = { confirmationNumber, confirmationNumbers[], segments, email, logEntry }
  const pnrToBooking = new Map()

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batchTotal = Math.ceil(emails.length / BATCH_SIZE)
    onProgress?.({ step: `Parsing emails (batch ${batchNum}/${batchTotal})…`, current: i, total: emails.length })

    const batchResults = await extractFlightsBatch(batch, geminiKey, { userName })

    for (let j = 0; j < batch.length; j++) {
      const email = batch[j]
      const { cancelled, confirmationNumbers, segments } = batchResults[j]
      // Prefer whichever code matches an already-confirmed activity; otherwise use first.
      const confNum = confirmationNumbers.find(c => existingSegmentsByPNR.has(c)) || confirmationNumbers[0] || null

      const logEntry = {
        subject: email.emailSubject || '(no subject)',
        from: email.emailFrom || '',
        date: email.internalDate ? new Date(email.internalDate).toLocaleDateString() : '?',
        cancelled,
        confirmationNumber: confNum,
        segments: segments.map(s => `${s.flightNumber} ${s.origin}→${s.destination} ${s.date}`),
        disposition: null,
        detail: null,
      }

      // ── Cancellation ────────────────────────────────────────────────────────
      if (cancelled) {
        if (confirmationNumbers.length > 0) {
          const alreadySeen = confirmationNumbers.find(c => seenCancelPNRs.has(c))
          if (alreadySeen) {
            logEntry.disposition = 'pnr_dedup'
            logEntry.detail = `Duplicate cancellation for PNR ${alreadySeen} — already processed`
            debugLog.push(logEntry)
            continue
          }
        }
        if (confNum) {
          confirmationNumbers.forEach(c => seenCancelPNRs.add(c))
          results.push({ type: 'cancellation', confirmationNumber: confNum, confirmationNumbers })
          logEntry.disposition = 'cancellation'
          logEntry.detail = `Cancellation for PNR ${confNum}`
        } else {
          logEntry.disposition = 'no_segments'
          logEntry.detail = 'Cancelled email with no PNR — skipped'
        }
        debugLog.push(logEntry)
        continue
      }

      // ── Merge into existing booking if any PNR overlaps ─────────────────────
      const existingBooking = confirmationNumbers.map(c => pnrToBooking.get(c)).find(Boolean)
      if (existingBooking) {
        // Accumulate any PNR codes this email introduces
        const newCodes = confirmationNumbers.filter(c => !existingBooking.confirmationNumbers.includes(c))
        newCodes.forEach(c => {
          existingBooking.confirmationNumbers.push(c)
          pnrToBooking.set(c, existingBooking)
        })
        // Newer email's segments overwrite (we're oldest-first, so this email is newer)
        if (segments.length > 0) {
          existingBooking.segments = segments
          existingBooking.email = email
        }
        logEntry.disposition = 'pnr_merge'
        logEntry.detail = `Merged into booking ${existingBooking.confirmationNumber}${newCodes.length ? ` · added PNRs: ${newCodes.join(', ')}` : ''}`
        debugLog.push(logEntry)
        continue
      }

      // ── No segments ─────────────────────────────────────────────────────────
      if (segments.length === 0) {
        logEntry.disposition = 'no_segments'
        logEntry.detail = 'No flight segments found by Gemini'
        debugLog.push(logEntry)
        continue
      }

      // ── New booking ─────────────────────────────────────────────────────────
      const primaryPNR = confNum || confirmationNumbers[0] || null

      if (primaryPNR) {
        // Register booking — reminder check and result creation deferred to final pass
        const booking = {
          confirmationNumber: primaryPNR,
          confirmationNumbers: [...confirmationNumbers],
          segments,
          email,
          logEntry,
        }
        confirmationNumbers.forEach(c => pnrToBooking.set(c, booking))
        logEntry.disposition = 'pending'
        debugLog.push(logEntry)
      } else {
        // No PNR — can't group, process immediately using flightNumber+date dedup
        const addedSegs = []
        for (const seg of segments) {
          const flightKey = `${seg.flightNumber}|${seg.date}`
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
            confirmationNumber: null,
            confirmationNumbers: [],
            importedFrom: 'gmail_sync',
            emailSubject: email.emailSubject || '',
            emailFrom: email.emailFrom || '',
            emailHtml: email.emailHtml || '',
          })
          addedSegs.push(`${seg.flightNumber} ${seg.origin}→${seg.destination} ${seg.date}`)
        }
        logEntry.disposition = addedSegs.length > 0 ? 'added' : 'flight_dedup'
        logEntry.detail = addedSegs.length > 0 ? addedSegs.join(' · ') : 'All segments already queued from another email this sync'
        debugLog.push(logEntry)
      }
    }
  }

  // ── Final pass: convert bookings to flight results ──────────────────────────
  // By processing here we use each booking's final accumulated state: the primary
  // PNR from the oldest email, all PNR codes from every related email, and segments
  // from the most recent email that had segments.
  const processedBookings = new Set()
  for (const booking of pnrToBooking.values()) {
    if (processedBookings.has(booking)) continue
    processedBookings.add(booking)

    const { confirmationNumber: primaryPNR, confirmationNumbers, segments, email, logEntry } = booking

    // Reminder check: all final segments already confirmed under any known PNR
    const matchedExistingPNR = confirmationNumbers.find(c => existingSegmentsByPNR.has(c))
    if (matchedExistingPNR && isSubset(segments, existingSegmentsByPNR.get(matchedExistingPNR))) {
      logEntry.disposition = 'reminder'
      logEntry.detail = `All segments already confirmed under PNR ${matchedExistingPNR}`
      continue
    }

    const addedSegs = []
    for (const seg of segments) {
      const flightKey = primaryPNR
        ? `${primaryPNR}|${seg.origin}|${seg.destination}`
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
        confirmationNumber: primaryPNR || null,
        confirmationNumbers,
        importedFrom: 'gmail_sync',
        emailSubject: email.emailSubject || '',
        emailFrom: email.emailFrom || '',
        emailHtml: email.emailHtml || '',
      })
      addedSegs.push(`${seg.flightNumber} ${seg.origin}→${seg.destination} ${seg.date}`)
    }

    logEntry.disposition = addedSegs.length > 0 ? 'added' : 'flight_dedup'
    logEntry.detail = addedSegs.length > 0 ? addedSegs.join(' · ') : 'All segments already queued from another email this sync'
  }

  const cancelledPNRs = new Set(
    results.filter(r => r.type === 'cancellation').flatMap(r => r.confirmationNumbers)
  )
  const filtered = results.filter(r => !(r.type === 'flight' && r.confirmationNumbers.some(c => cancelledPNRs.has(c))))

  // Mark any added entries that were suppressed by the cancelled-PNR filter
  debugLog.forEach(entry => {
    if (entry.disposition === 'added' && entry.confirmationNumber && cancelledPNRs.has(entry.confirmationNumber)) {
      entry.disposition = 'cancelled_suppressed'
      entry.detail = `Flight suppressed — cancellation email for PNR ${entry.confirmationNumber} found in same sync`
    }
  })

  filtered.sort((a, b) => {
    if (a.type === 'cancellation') return 1
    if (b.type === 'cancellation') return -1
    return (a.date || '').localeCompare(b.date || '')
  })
  return { results: filtered, debugLog }
}
