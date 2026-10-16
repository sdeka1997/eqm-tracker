import { useState } from 'react'
import { dayOffset } from '../utils/calculations'

// "3 days later" / "same day" hint for a candidate's date against the projection's.
export function dayGapLabel(date, from) {
  if (!from) return ''
  const days = dayOffset(date, from)
  return days === 0 ? 'same day' : `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ${days > 0 ? 'later' : 'earlier'}`
}

// "Already posted / booked? Pick the real one" list used by every projection's
// edit screen. Callers rank their own suggestions and describe their own rows;
// this handles the list, the search, and the empty states.
//
// describe(item) → { title, subtitle, right }. Leave out searchText to show
// only the suggestions, with no search box.
// Why a projection is overdue, shown above its picker. The same note for every
// kind of projection: resolve it by matching below, or with the screen's Delete.
export function FlagNote({ children }) {
  return (
    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠ {children}</div>
  )
}

export default function MatchPicker({ label, suggestions, searchPool, searchText, describe, onMatch, emptyText }) {
  const [search, setSearch] = useState('')
  const searchable = !!searchText
  const query = searchable ? search.trim().toLowerCase().replace(/^\$/, '') : ''
  const items = query
    ? searchPool.filter(item => searchText(item).toLowerCase().includes(query))
    : suggestions

  if (searchable && searchPool.length === 0) return null

  return (
    <div className="pt-2">
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      {searchable && (
        <input
          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-alaska-blue"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}
      {items.length > 0 ? (
        <ul className="border border-slate-100 rounded-xl divide-y divide-slate-50 max-h-64 overflow-y-auto">
          {items.map(item => {
            const { title, subtitle, right } = describe(item)
            return (
              <li key={item.id}>
                <button
                  onClick={() => onMatch(item)}
                  className="w-full flex justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-slate-600">{title}</span>
                    <span className="block text-slate-400">{subtitle}</span>
                  </span>
                  <span className="shrink-0 text-slate-500">{right}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">{query ? 'Nothing matches that search.' : emptyText}</p>
      )}
    </div>
  )
}
