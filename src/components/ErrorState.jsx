import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorState({ message = '加载失败', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-5 animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-bounceIn"
        style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(239, 68, 68, 0.12))',
          border: '1px solid rgba(239, 68, 68, 0.1)',
        }}>
        <AlertTriangle size={28} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">{message}</p>
        <p className="text-xs text-slate-400 mt-1">请检查网络连接后重试</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary gap-2 text-sm">
          <RefreshCw size={14} />
          重新加载
        </button>
      )}
    </div>
  );
}
