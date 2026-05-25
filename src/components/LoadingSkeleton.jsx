export function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 animate-pulse"
      style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-3 w-20 bg-slate-200/60 rounded-md" />
        <div className="w-9 h-9 rounded-xl bg-slate-200/60" />
      </div>
      <div className="h-7 w-24 bg-slate-200/60 rounded-lg mb-2" />
      <div className="h-3 w-32 bg-slate-200/40 rounded-md" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)' }}>
      <div className="px-5 py-3 flex gap-8" style={{ background: 'rgba(241,245,249,0.5)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-200/60 rounded-md flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 flex gap-8 border-b border-slate-100/40">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-slate-100/60 rounded-md flex-1" style={{ animationDelay: `${i * 50 + j * 30}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="relative">
        <div className="w-12 h-12 rounded-full" style={{ border: '2px solid rgba(99,102,241,0.1)' }} />
        <div className="absolute inset-0 w-12 h-12 rounded-full animate-spin"
          style={{ border: '2px solid transparent', borderTopColor: '#6366f1', borderRightColor: '#8b5cf6' }} />
        <div className="absolute inset-2 rounded-full"
          style={{ border: '1px solid rgba(99,102,241,0.05)' }} />
      </div>
    </div>
  );
}
