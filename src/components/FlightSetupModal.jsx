export default function FlightSetupModal({ onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Add your flights</h2>
            <p className="text-xs text-slate-400 mt-0.5">Choose how you'd like to get started</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-3">
          <button
            onClick={() => onSelect('flighty')}
            className="w-full text-left border-2 border-alaska-teal rounded-xl p-4 hover:bg-alaska-teal/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">✈️</span>
              <div>
                <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  Import Flighty CSV
                  <span className="text-xs bg-alaska-teal text-white px-2 py-0.5 rounded-full font-medium">Start here</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Import your full flight history from the Flighty app</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelect('calendar')}
            className="w-full text-left border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">📧</span>
              <div>
                <div className="font-semibold text-slate-800 text-sm">Poll Gmail</div>
                <p className="text-xs text-slate-500 mt-0.5">Catch recent flights from confirmation emails (last 21 days)</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => onSelect('flight')}
            className="w-full text-left border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">✏️</span>
              <div>
                <div className="font-semibold text-slate-800 text-sm">Add manually</div>
                <p className="text-xs text-slate-500 mt-0.5">Enter flights one by one</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
