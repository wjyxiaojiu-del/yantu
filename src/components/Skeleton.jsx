export function Skeleton({ className = '', style = {} }) {
  return (
    <div
      className={`bg-slate-100/70 rounded-md ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({ lines = 1, lastWidth = '70%', className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 ? lastWidth : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 'w-11 h-11', className = '' }) {
  return <Skeleton className={`${size} rounded-full ${className}`} />;
}

export function SkeletonButton({ width = 'w-20', className = '' }) {
  return <Skeleton className={`h-9 rounded-lg ${width} ${className}`} />;
}

export function SkeletonStat({ className = '' }) {
  return (
    <div className={`stat-card space-y-2 ${className}`}>
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-7 w-12" />
    </div>
  );
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card p-5 space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar size="w-11 h-11" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} lastWidth="60%" />
      <div className="flex gap-2 pt-1">
        <SkeletonButton width="flex-1" />
        <SkeletonButton width="w-16" />
        <SkeletonButton width="w-12" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = '' }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="divide-y divide-slate-100">
        <div className="flex gap-4 px-5 py-3 bg-slate-50/50">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" style={{ maxWidth: `${20 + Math.random() * 30}%` }} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-5 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" style={{ maxWidth: `${20 + Math.random() * 30}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
