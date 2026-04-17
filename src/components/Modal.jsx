export default function Modal({ onClose, maxWidth = 'max-w-md', className = '', children }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
