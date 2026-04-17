import { useState, useRef } from 'react'
import { parseFlightyCSV } from '../utils/flightyImport'
import Spinner from './Spinner'

export default function FlightyImport({ earningMethod, onAddPending, onCancel }) {
  const [state, setState] = useState('idle') // idle | preview | importing | done
  const [flights, setFlights] = useState([])
  const [selected, setSelected] = useState(new Set()) // indices of selected flights
  const [error, setError] = useState('')
  const [imported, setImported] = useState(0)
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = parseFlightyCSV(ev.target.result, { earningMethod })
        if (parsed.length === 0) {
          setError('No flights found in this CSV. Make sure it\'s a Flighty export.')
          return
        }
        setFlights(parsed)
        setSelected(new Set())
        setState('preview')
        setError('')
      } catch (err) {
        setError(`Failed to parse CSV: ${err.message}`)
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    const toImport = flights.filter((_, i) => selected.has(i))
    setImported(0)
    setState('importing')
    for (let i = 0; i < toImport.length; i++) {
      await onAddPending(toImport[i])
      setImported(i + 1)
    }
    setState('done')
  }

  if (state === 'idle') {
    return (
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1.5">
          <p className="font-semibold text-slate-800">Import from Flighty</p>
          <p>1. Open Flighty → Settings → Export Data → Export CSV</p>
          <p>2. Upload the file here</p>
          <p>3. All flights go to your <strong>review queue</strong> — nothing saves until you confirm</p>
        </div>
        <div
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-alaska-blue hover:bg-alaska-blue/5 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { fileRef.current.files = e.dataTransfer.files; handleFile({ target: { files: e.dataTransfer.files } }) } }}
        >
          <p className="text-sm font-medium text-slate-600">Drop CSV here or click to browse</p>
          <p className="text-xs text-slate-400 mt-1">FlightyExport-*.csv</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <button onClick={onCancel} className="w-full border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
          Cancel
        </button>
      </div>
    )
  }

  if (state === 'preview') {
    const byYear = {}
    flights.forEach((f, i) => {
      if (!byYear[f.year]) byYear[f.year] = []
      byYear[f.year].push(i)
    })
    const selectedCount = selected.size
    const cancelled = flights.filter((f, i) => selected.has(i) && f.cancelled).length

    function toggleYear(year) {
      const indices = byYear[year] || []
      const allSelected = indices.every(i => selected.has(i))
      setSelected(prev => {
        const next = new Set(prev)
        allSelected ? indices.forEach(i => next.delete(i)) : indices.forEach(i => next.add(i))
        return next
      })
    }

    function toggleFlight(i) {
      setSelected(prev => {
        const next = new Set(prev)
        next.has(i) ? next.delete(i) : next.add(i)
        return next
      })
    }

    return (
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-slate-800">{flights.length} flights found</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byYear).sort().map(([year, indices]) => {
              const allSelected = indices.every(i => selected.has(i))
              const someSelected = indices.some(i => selected.has(i))
              return (
                <button
                  key={year}
                  onClick={() => toggleYear(parseInt(year))}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                    allSelected ? 'bg-alaska-blue text-white border-alaska-blue'
                    : someSelected ? 'bg-alaska-blue/20 text-alaska-blue border-alaska-blue/30'
                    : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  {year}: {indices.length}
                </button>
              )
            })}
          </div>
          {cancelled > 0 && (
            <p className="text-xs text-amber-600">{cancelled} cancelled will be flagged in queue</p>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50 text-sm">
          {flights.map((f, i) => {
            const isSelected = selected.has(i)
            return (
              <div
                key={i}
                onClick={() => toggleFlight(i)}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                  isSelected ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-alaska-blue border-alaska-blue' : 'border-slate-300'
                }`}>
                  {isSelected && <span className="text-white text-xs leading-none">✓</span>}
                </div>
                <div className="flex-1 flex items-center justify-between min-w-0">
                  <div className="flex items-center gap-2">
                    {f.cancelled && <span className="text-xs text-red-400">✕</span>}
                    <span className={`font-medium ${isSelected ? 'text-slate-700' : 'text-slate-400'}`}>
                      {f.origin} → {f.destination}
                    </span>
                    <span className="text-xs text-slate-400">{f.flightNumber}</span>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{f.date}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setState('idle'); setFlights([]) }} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">
            Back
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0}
            className="flex-1 bg-alaska-teal hover:bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            Add {selectedCount} to Queue
          </button>
        </div>
      </div>
    )
  }

  if (state === 'importing') {
    return (
      <div className="text-center py-8 space-y-3">
        <Spinner color="teal" className="mx-auto" />
        <p className="text-sm font-medium text-slate-700">Adding to review queue…</p>
        <p className="text-xs text-slate-400">{imported} / {selected.size}</p>
      </div>
    )
  }

  if (state === 'done') {
    return (
      <div className="text-center py-6 space-y-2">
        <div className="text-4xl mb-3">📋</div>
        <p className="font-semibold text-slate-800">{imported} flights added to review queue</p>
        <p className="text-sm text-slate-500 mb-4">Review and confirm each one on your dashboard</p>
        <button onClick={onCancel} className="bg-alaska-teal text-white px-6 py-2 rounded-xl text-sm font-medium">
          Done
        </button>
      </div>
    )
  }

  return null
}
