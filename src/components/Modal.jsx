import { createPortal } from 'react-dom'

// Portaled to <body> so a transformed ancestor (e.g. the review queue's swipe
// card) can't become the containing block for `fixed` or block touch scrolling.
export default function Modal({ onClose, maxWidth = 'max-w-md', className = '', children }) {
  return createPortal(
    <div data-modal
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      // React events still bubble through portals; keep taps/drags here from
      // reaching swipe handlers on the component that opened the modal.
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}
