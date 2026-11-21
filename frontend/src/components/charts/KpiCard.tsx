import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { KpiSkeleton } from '@/components/skeletons'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  value: ReactNode
  /** Relative change vs previous period, e.g. 0.12 = +12%. */
  delta?: number
  /** Set false when "up" is bad (e.g. number of frauds) — flips the green/red. */
  upIsGood?: boolean
  hint?: string
  icon?: ReactNode
  loading?: boolean
}

/** A headline number. Use instead of a chart when the message is one value. */
export function KpiCard({ label, value, delta, upIsGood = true, hint, icon, loading }: Props) {
  if (loading) return <KpiSkeleton />

  const dir = delta === undefined || delta === 0 ? 0 : delta > 0 ? 1 : -1
  const good = dir === 0 ? null : (dir > 0) === upIsGood
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus

  return (
    <div className="bg-card rounded-xl border p-4 sm:p-5">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</div>
      {(delta !== undefined || hint) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {delta !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                good === null ? 'text-muted-foreground' : good ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {delta > 0 ? '+' : ''}
              {formatPercent(delta)}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  )
}
