import { useMindMapStore } from '../store/mindMapStore';

const iconMap = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

const colorMap = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

export default function ToastContainer() {
  const toasts = useMindMapStore((s) => s.toasts);
  const removeToast = useMindMapStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast-enter pointer-events-auto flex items-center gap-2 px-4 py-2.5 bg-white rounded-lg shadow-lg border border-gray-200 min-w-[200px] max-w-[320px]"
        >
          <span className={`${colorMap[toast.type]} text-white w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0`}>
            {iconMap[toast.type]}
          </span>
          <span className="text-sm text-gray-700 flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600 text-xs ml-2 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
