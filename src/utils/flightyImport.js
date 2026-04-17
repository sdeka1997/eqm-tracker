import { calculateDistance } from './airports'
import { calculateFlightPoints, FARE_OPTIONS } from './calculations'


// ICAO → IATA airline code mapping
const ICAO_TO_IATA = {
  ASA:'AS', QXE:'QX', HAL:'HA', AAL:'AA', UAL:'UA', DAL:'DL', SWA:'WN',
  JBU:'B6', NKS:'NK', FFT:'F9', GLA:'G4', SCX:'SY', ACA:'AC', WJA:'WS',
  DLH:'LH', AFR:'AF', KLM:'KL', SAS:'SK', SIA:'SQ', ANA:'NH', OZZ:'OZ',
  KAL:'KE', CES:'MU', CCA:'CA', CSN:'CZ', UAE:'EK', ETD:'EY', QTR:'QR',
  THY:'TK', SWR:'LX', AUA:'OS', AZA:'AZ', BAW:'BA', CPA:'CX', JAL:'JL',
  FIN:'AY', IBE:'IB', QFA:'QF', MAS:'MH', SRI:'UL', RJA:'RJ', RAM:'AT',
  AVA:'AV', LAN:'LA', TAM:'JJ', GOL:'G3', AZU:'AD', VOE:'VY', VLG:'VY',
  EIN:'EI', RYR:'FR', EZY:'U2', TOM:'BY', TCX:'MT', WZZ:'W6',
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())

  return lines.slice(1).map(line => {
    // Handle quoted fields
    const values = []
    let current = '', inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes }
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else { current += char }
    }
    values.push(current.trim())

    const row = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

export function parseFlightyCSV(csvText, { earningMethod }) {
  const rows = parseCSV(csvText)
  const results = []

  for (const row of rows) {
    const date = row['Date']?.slice(0, 10)
    const icao = row['Airline']?.trim().toUpperCase()
    const flightNum = row['Flight']?.trim()
    const origin = row['From']?.trim().toUpperCase()
    const destination = row['To']?.trim().toUpperCase()
    const cancelled = row['Canceled']?.toLowerCase() === 'true'
    const pnr = row['PNR']?.trim() || null
    const cabinClass = row['Cabin Class']?.trim() || ''
    const flightyId = row['Flight Flighty ID']?.trim() || null
    const seat = row['Seat']?.trim() || ''

    if (!date || !icao || !flightNum || !origin || !destination) continue

    const iata = ICAO_TO_IATA[icao] || icao.slice(0, 2)
    const flightNumber = `${iata} ${flightNum}`
    const year = parseInt(date.slice(0, 4))

    const isAlaskaFamily = ['AS', 'QX', 'HA'].includes(iata)
    const bookingType = isAlaskaFamily ? 'alaska_direct' : null

    // Map cabin class if available
    let fareOption = isAlaskaFamily ? 'economy_std' : null
    if (cabinClass) {
      const c = cabinClass.toLowerCase()
      if (c.includes('first')) fareOption = isAlaskaFamily ? 'first' : 'first'
      else if (c.includes('business')) fareOption = isAlaskaFamily ? 'first' : 'business'
      else if (c.includes('premium')) fareOption = isAlaskaFamily ? 'premium_class' : 'premium_economy'
    }

    const dist = calculateDistance(origin, destination)
    const fareOpts = FARE_OPTIONS[bookingType] || []
    const selectedFare = fareOpts.find(o => o.value === fareOption) || fareOpts[0]
    const pts = calculateFlightPoints({ earningMethod, distanceMiles: dist || 0, bookingType, fareOption })

    results.push({
      type: 'flight',
      flightNumber,
      origin,
      destination,
      date,
      year,
      distanceMiles: dist || 0,
      bookingType,
      fareOption,
      fareLabel: selectedFare?.label || '',
      multiplier: selectedFare?.multiplier || 1,
      fareSource: cabinClass ? 'flighty' : 'estimated',
      statusPoints: pts,
      confirmationNumber: pnr || null,
      seat: seat || null,
      importedFrom: 'flighty_csv',
      flightyId,
      cancelled,
    })
  }

  results.sort((a, b) => b.date.localeCompare(a.date))
  return results
}
