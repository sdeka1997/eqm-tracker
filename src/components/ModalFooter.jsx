// Footer for edit screens: Delete | Cancel | Save. Delete is the one way to
// remove an item (rows have no ×), so every edit screen passes onDelete.
export default function ModalFooter({ onDelete, onCancel, onSave, saveDisabled }) {
  return (
    <div className="flex border-t border-slate-100">
      {onDelete && (
        <>
          <button onClick={onDelete} className="flex-1 py-3 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 rounded-bl-2xl transition-colors font-medium">
            Delete
          </button>
          <div className="w-px bg-slate-100" />
        </>
      )}
      <button onClick={onCancel} className={`flex-1 py-3 text-sm text-slate-500 hover:bg-slate-50 ${onDelete ? '' : 'rounded-bl-2xl'} transition-colors font-medium`}>
        Cancel
      </button>
      <div className="w-px bg-slate-100" />
      <button
        onClick={onSave}
        disabled={saveDisabled}
        className="flex-1 py-3 text-sm text-alaska-blue hover:bg-alaska-blue hover:text-white rounded-br-2xl transition-colors font-semibold disabled:opacity-40"
      >
        Save
      </button>
    </div>
  )
}
