import { Skeleton } from '@/components/ui/skeleton'

/** Ready-made loading placeholders. Match the shape of the real content to avoid layout jump. */

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Ładowanie">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-14" />
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Ładowanie">
      <div className="flex gap-4">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="flex items-end gap-2" style={{ height }} aria-busy="true" aria-label="Ładowanie wykresu">
      {[40, 65, 50, 80, 60, 90, 70, 55, 75, 45, 85, 60].map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

export function KpiSkeleton() {
  return (
    <div className="bg-card space-y-3 rounded-xl border p-5" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}
