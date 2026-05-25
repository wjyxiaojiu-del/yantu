import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ children, onClose, title }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel p-6 w-full max-w-lg overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          {title && <h3 className="text-lg font-bold text-slate-800">{title}</h3>}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100/60 text-slate-400 hover:text-slate-600 transition-all ml-auto"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
