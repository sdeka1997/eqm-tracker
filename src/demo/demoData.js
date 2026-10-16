import { calculateDistance } from '../utils/airports'
import { calculateFlightPoints, calculateCardPoints, FARE_OPTIONS, getToday } from '../utils/calculations'

// Sample data for demo mode. Dates are placed relative to today so the demo
// always shows a year in progress: most activity already flown, a few trips
// still planned.

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

// Spread past activity across the elapsed part of the year: frac 0 is Jan 1,
// frac 1 is yesterday.
function pastDate(year, frac) {
  const start = new Date(Date.UTC(year, 0, 1))
  const today = new Date(getToday() + 'T00:00:00Z')
  const elapsed = Math.max(1, Math.round((today - start) / 86400000) - 1)
  return isoDate(addDays(start, Math.floor(elapsed * frac)))
}

function flight({ origin, destination, date, flightNumber, bookingType, fareOption, pnr }) {
  const distanceMiles = calculateDistance(origin, destination) || 0
  const fare = (FARE_OPTIONS[bookingType] || []).find(o => o.value === fareOption)
  return {
    type: 'flight',
    origin,
    destination,
    date,
    flightNumber,
    bookingType,
    fareOption,
    fareLabel: fare?.label || '',
    multiplier: fare?.multiplier ?? 1,
    distanceMiles,
    ticketPrice: 0,
    confirmationNumber: pnr,
    statusPoints: calculateFlightPoints({ earningMethod: 'distance', distanceMiles, bookingType, fareOption }),
  }
}

const MERCHANTS = [
  ['Whole Foods Market', 186.42], ['Delta Sonic Car Wash', 24.0], ['Amazon', 312.77],
  ['Shell', 58.19], ['PCC Community Markets', 94.3], ['Alaska Airlines', 642.6],
  ['Costco', 241.88], ['Seattle City Light', 112.5], ['Uber', 38.9], ['Rei', 215.0],
  ['Starbucks', 17.85], ['Comcast', 89.99], ['Trader Joe\'s', 76.14], ['Marriott', 489.2],
]

function cardMonth(year, month, count, offset, lastDay) {
  const entries = []
  for (let i = 0; i < count; i++) {
    const [notes, amount] = MERCHANTS[(offset + i) % MERCHANTS.length]
    const day = Math.min(lastDay, 2 + Math.floor((i * 27) / count))
    entries.push({
      type: 'card_spend',
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      amount,
      notes,
      statusPoints: calculateCardPoints(amount),
    })
  }
  return entries
}

function cardSpend(year, { throughToday }) {
  const today = getToday()
  const lastMonth = throughToday && today.startsWith(String(year)) ? parseInt(today.slice(5, 7)) : 12
  const entries = []
  for (let m = 1; m <= lastMonth; m++) {
    const isCurrent = throughToday && m === lastMonth
    const lastDay = isCurrent ? Math.max(1, parseInt(today.slice(8, 10)) - 1) : 28
    entries.push(...cardMonth(year, m, isCurrent ? 3 : 8, m * 3, lastDay))
  }
  return entries
}

export function buildDemoActivities(year) {
  const today = getToday()
  const prev = year - 1
  const planned = (days) => isoDate(addDays(new Date(today + 'T00:00:00Z'), days))

  const current = [
    flight({ origin: 'SEA', destination: 'JFK', date: pastDate(year, 0.04), flightNumber: 'AS 24',   bookingType: 'alaska_direct',      fareOption: 'economy_std', pnr: 'KXQWPL' }),
    flight({ origin: 'JFK', destination: 'SEA', date: pastDate(year, 0.07), flightNumber: 'AS 21',   bookingType: 'alaska_direct',      fareOption: 'economy_HK',  pnr: 'KXQWPL' }),
    flight({ origin: 'SEA', destination: 'ANC', date: pastDate(year, 0.15), flightNumber: 'AS 83',   bookingType: 'award',              fareOption: 'award',       pnr: 'RMTZBA' }),
    flight({ origin: 'SEA', destination: 'HNL', date: pastDate(year, 0.24), flightNumber: 'AS 879',  bookingType: 'alaska_direct',      fareOption: 'first_C',     pnr: 'HNLVAC' }),
    flight({ origin: 'HNL', destination: 'SEA', date: pastDate(year, 0.27), flightNumber: 'AS 880',  bookingType: 'alaska_direct',      fareOption: 'first_DI',    pnr: 'HNLVAC' }),
    flight({ origin: 'SEA', destination: 'SFO', date: pastDate(year, 0.38), flightNumber: 'AS 1094', bookingType: 'alaska_direct',      fareOption: 'economy_std', pnr: 'QPLMNE' }),
    flight({ origin: 'SFO', destination: 'SEA', date: pastDate(year, 0.39), flightNumber: 'AS 1081', bookingType: 'alaska_direct',      fareOption: 'saver',       pnr: 'QPLMNE' }),
    flight({ origin: 'SEA', destination: 'LHR', date: pastDate(year, 0.52), flightNumber: 'BA 48',   bookingType: 'partner_via_alaska', fareOption: 'intl_business', pnr: 'BAWLDN' }),
    flight({ origin: 'LHR', destination: 'SEA', date: pastDate(year, 0.58), flightNumber: 'BA 49',   bookingType: 'partner_via_alaska', fareOption: 'prem_economy',  pnr: 'BAWLDN' }),
    flight({ origin: 'SEA', destination: 'BOS', date: pastDate(year, 0.81), flightNumber: 'AS 12',   bookingType: 'alaska_direct',      fareOption: 'first_J',     pnr: 'TZBOSX' }),
    flight({ origin: 'BOS', destination: 'SEA', date: pastDate(year, 0.85), flightNumber: 'AS 15',   bookingType: 'alaska_direct',      fareOption: 'economy_YB',  pnr: 'TZBOSX' }),
    // Planned
    flight({ origin: 'SEA', destination: 'NRT', date: planned(18), flightNumber: 'JL 67',  bookingType: 'partner_via_alaska', fareOption: 'prem_economy', pnr: 'JLTKYO' }),
    flight({ origin: 'NRT', destination: 'SEA', date: planned(27), flightNumber: 'JL 68',  bookingType: 'partner_via_alaska', fareOption: 'prem_economy', pnr: 'JLTKYO' }),
    flight({ origin: 'SEA', destination: 'LAX', date: planned(41), flightNumber: 'AS 1310', bookingType: 'alaska_direct',     fareOption: 'economy_std', pnr: 'LAXHOL' }),
    ...cardSpend(year, { throughToday: true }),
    { type: 'anniversary_bonus', date: pastDate(year, 0.45), notes: 'Summit card anniversary bonus', statusPoints: 10000 },
    { type: 'misc', description: 'Atmos Rewards welcome bonus', statusPoints: 2500, date: pastDate(year, 0.02) },
    { type: 'misc', description: 'Hertz rental (partner earning)', statusPoints: 400, date: pastDate(year, 0.5) },
  ]

  const previous = [
    flight({ origin: 'SEA', destination: 'ORD', date: `${prev}-03-11`, flightNumber: 'AS 22',  bookingType: 'alaska_direct', fareOption: 'economy_std', pnr: 'ORDCHI' }),
    flight({ origin: 'ORD', destination: 'SEA', date: `${prev}-03-15`, flightNumber: 'AS 25',  bookingType: 'alaska_direct', fareOption: 'economy_std', pnr: 'ORDCHI' }),
    flight({ origin: 'SEA', destination: 'OGG', date: `${prev}-07-02`, flightNumber: 'AS 865', bookingType: 'alaska_direct', fareOption: 'economy_HK',  pnr: 'MAUIFF' }),
    flight({ origin: 'OGG', destination: 'SEA', date: `${prev}-07-12`, flightNumber: 'AS 866', bookingType: 'alaska_direct', fareOption: 'economy_HK',  pnr: 'MAUIFF' }),
    flight({ origin: 'SEA', destination: 'DCA', date: `${prev}-10-20`, flightNumber: 'AS 4',   bookingType: 'alaska_direct', fareOption: 'first_DI',    pnr: 'DCAWRK' }),
    flight({ origin: 'DCA', destination: 'SEA', date: `${prev}-10-24`, flightNumber: 'AS 3',   bookingType: 'alaska_direct', fareOption: 'first_DI',    pnr: 'DCAWRK' }),
    ...cardSpend(prev, { throughToday: false }),
  ]

  return [...current, ...previous]
}
