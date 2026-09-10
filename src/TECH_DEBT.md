# Tech Debt & DRY Violations

Items identified in code audit (April 2026). High-severity items are being addressed separately.

---

## Medium

### Modal button footer pattern duplicated 5×
The cancel/confirm button row (`flex border-t border-slate-100` + divider + rounded corners) is copy-pasted into:
- `ActivityLog.jsx` — FlightEditModal footer
- `CardSpendSection.jsx` — EditDateModal footer
- `ReviewQueue.jsx` — FlightReviewCard footer
- `Dashboard.jsx` — Delete account confirmation footer
- `Dashboard.jsx` — Delete all confirmation footer

Fix: Extract a `<DialogFooter onCancel onConfirm cancelLabel confirmLabel disabled />` component.

---

### 5 near-identical `onSnapshot` dedup watchers in Dashboard.jsx
`allPlaidIds`, `allFlightyIds`, `allGmailFlightKeys`, `allActivitiesByPNR`, and the card connection watcher all follow the same `useEffect → query → onSnapshot → setState` pattern. Any change to the pattern (error handling, cleanup) must be applied 5 times.

Fix: Extract a `useDeduplicationTracker(uid, collectionPath, filterFn, mapFn)` hook.

---

### Magic numbers hardcoded and repeated in `ReviewQueue.jsx`
- Swipe animation duration: `280` (ms) — appears at lines ~357, 407, 428
- Undo toast timeout: `4000` (ms) — line ~420
- Swipe threshold: `80` (px) — used 4× after being defined once as `THRESHOLD`

Fix: Extract to a `constants.js` (or top of ReviewQueue) and reference by name.

---

## Low

### `groupByMonth()` exists in `calculations.js` but isn't used consistently
Some components call it; others re-derive month grouping inline with `.slice(0, 7)`. Should standardize on the utility.

### `useModalState` pattern reinvented per-component
`[modal, setModal]` / `[editing, setEditing]` / `[showForm, setShowForm]` are all the same open/close pattern. A small `useModalState(initial)` hook returning `{ value, open, close }` would reduce boilerplate.

### Unnecessary local aliases for imported constants
`FlightForm.jsx` and `CardSpendForm.jsx` both do `const inputCls = INPUT_CLS` after importing `INPUT_CLS`. The alias adds nothing — use the import directly.
