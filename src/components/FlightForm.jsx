import { useState, useEffect } from 'react'
import { calculateDistance, lookupAirport } from '../utils/airports'
import {
  calculateFlightPoints,
  FARE_OPTIONS,
  EARNING_METHODS,
} from '../utils/calculations'
import { INPUT_CLS, LABEL_CLS } from '../utils/styles'
import FlightFields from './FlightFields'
import { parseConfirmation } from '../utils/parser'

const defaultForm = {
  origin: '',
  destination: '',
  date: new Date().toISOString().slice(0, 10),
  flightNumber: '',
  bookingType: 'alaska_direct',
  fareOption: 'economy_std',
  confirmationNumber: '',
  ticketPrice: '',
  pasteText: '',
}

export default function FlightForm({ onSubmit, earningMethod, onCancel }) {
  const [form, setForm] = useState(defaultForm)
  const [distance, setDistance] = useState(null)
  const [distanceError, setDistanceError] = useState('')
  const [manualDistance, setManualDistance] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [parsed, setParsed] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // When bookingType changes, reset fareOption to first option in that group
  useEffect(() => {
    const opts = FARE_OPTIONS[form.bookingType]
    if (opts && !opts.find(o => o.value === form.fareOption)) {
      set('fareOption', opts[0].value)
    }
  }, [form.bookingType])

  useEffect(() => {
    if (form.origin.length === 3 && form.destination.length === 3) {
      const d = calculateDistance(form.origin, form.destination)
      if (d !== null) {
        setDistance(d)
        setDistanceError('')
        setManualDistance('')
      } else {
        setDistance(null)
        const oKnown = lookupAirport(form.origin)
        const dKnown = lookupAirport(form.destination)
        if (!oKnown) setDistanceError(`Unknown airport: ${form.origin}`)
        else if (!dKnown) setDistanceError(`Unknown airport: ${form.destination}`)
        else setDistanceError('')
      }
    } else {
      setDistance(null)
      setDistanceError('')
    }
  }, [form.origin, form.destination])

  const effectiveDistance = distance ?? (manualDistance ? parseInt(manualDistance) : 0)

  const fareOpts = FARE_OPTIONS[form.bookingType] || []
  const selectedFare = fareOpts.find(o => o.value === form.fareOption) || fareOpts[0]

  const statusPoints = calculateFlightPoints({
    earningMethod,
    distanceMiles: effectiveDistance,
    ticketPrice: parseFloat(form.ticketPrice) || 0,
    bookingType: form.bookingType,
    fareOption: form.fareOption,
  })

  function handleParse() {
    const extracted = parseConfirmation(form.pasteText)
    if (Object.keys(extracted).length > 0) {
      setForm(f => ({ ...f, ...extracted }))
      setParsed(true)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.origin || !form.destination || !form.date) return
    onSubmit({
      type: 'flight',
      origin: form.origin.toUpperCase(),
      destination: form.destination.toUpperCase(),
      date: form.date,
      flightNumber: form.flightNumber,
      bookingType: form.bookingType,
      fareOption: form.fareOption,
      fareLabel: selectedFare?.label || '',
      multiplier: selectedFare?.multiplier || 1,
      distanceMiles: effectiveDistance,
      ticketPrice: parseFloat(form.ticketPrice) || 0,
      confirmationNumber: form.confirmationNumber || null,
      statusPoints,
    })
  }

  const inputCls = INPUT_CLS
  const labelCls = LABEL_CLS

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Paste confirmation */}
      <div>
        <button type="button" onClick={() => setShowPaste(!showPaste)} className="text-xs text-alaska-blue hover:underline">
          {showPaste ? '▾' : '▸'} Paste flight confirmation to auto-fill
        </button>
        {showPaste && (
          <div className="mt-2 space-y-2">
            <textarea
              className={inputCls + ' h-24 resize-none'}
              placeholder="Paste your confirmation email or type: SEA to JFK on Apr 5, AS 100"
              value={form.pasteText}
              onChange={e => { set('pasteText', e.target.value); setParsed(false) }}
            />
            <button type="button" onClick={handleParse} className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-medium">
              Parse & Auto-fill
            </button>
            {parsed && <p className="text-xs text-green-600">✓ Fields filled — review and confirm</p>}
          </div>
        )}
      </div>

      {/* Route */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Origin *</label>
          <input className={inputCls + ' uppercase'} maxLength={3} placeholder="SEA"
            value={form.origin} onChange={e => set('origin', e.target.value.toUpperCase())} required />
        </div>
        <div>
          <label className={labelCls}>Destination *</label>
          <input className={inputCls + ' uppercase'} maxLength={3} placeholder="JFK"
            value={form.destination} onChange={e => set('destination', e.target.value.toUpperCase())} required />
        </div>
      </div>

      {distance !== null && (
        <p className="text-xs text-slate-500 -mt-2">📏 {distance.toLocaleString()} miles (auto-calculated)</p>
      )}
      {distanceError && (
        <div className="-mt-2 space-y-1">
          <p className="text-xs text-amber-600">{distanceError}</p>
          <div>
            <label className={labelCls}>Enter distance manually (miles)</label>
            <input type="number" className={inputCls} placeholder="e.g. 2422"
              value={manualDistance} onChange={e => setManualDistance(e.target.value)} />
          </div>
        </div>
      )}

      {/* Date & flight number */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date *</label>
          <input type="date" className={inputCls} value={form.date}
            onChange={e => set('date', e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>Flight Number</label>
          <input className={inputCls + ' uppercase'} placeholder="AS 100"
            value={form.flightNumber} onChange={e => set('flightNumber', e.target.value.toUpperCase())} />
        </div>
      </div>

      {/* Booking type, fare class, PNR */}
      <FlightFields
        distanceMiles={effectiveDistance}
        onDistanceChange={v => setManualDistance(String(v))}
        bookingType={form.bookingType}
        onBookingTypeChange={v => set('bookingType', v)}
        fareOption={form.fareOption}
        onFareOptionChange={v => set('fareOption', v)}
        pnr={form.confirmationNumber || ''}
        onPnrChange={v => set('confirmationNumber', v)}
        hideDistance
      />

      {form.bookingType === 'award' && (
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
          Award tickets always earn <strong>1 SP/mile</strong> regardless of cabin or airline.
        </div>
      )}

      {/* Ticket price for spend method */}
      {earningMethod === 'spend' && (
        <div>
          <label className={labelCls}>Ticket Price ($) — required for spend method</label>
          <input type="number" min="0" step="0.01" className={inputCls} placeholder="e.g. 450.00"
            value={form.ticketPrice} onChange={e => set('ticketPrice', e.target.value)} />
        </div>
      )}

      {/* Points preview */}
      <div className="bg-alaska-blue/5 border border-alaska-blue/20 rounded-xl p-3 text-center">
        <div className="text-2xl font-bold text-alaska-blue">+{statusPoints.toLocaleString()}</div>
        <div className="text-xs text-slate-500">
          Status Points
          {earningMethod === 'distance' && effectiveDistance > 0 && selectedFare
            ? ` (${effectiveDistance.toLocaleString()} mi × ${selectedFare.multiplier}×)`
            : ` (${earningMethod} method)`}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
          Cancel
        </button>
        <button type="submit"
          className="flex-1 bg-alaska-blue hover:bg-alaska-navy text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
          Add Flight
        </button>
      </div>
    </form>
  )
}
