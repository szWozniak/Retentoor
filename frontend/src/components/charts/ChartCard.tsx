import { useState, type ReactNode } from 'react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChartSkeleton } from '@/components/skeletons'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { formatNumber } from '@/lib/format'
import type { Series } from './series'

type Row = { [key: string]: unknown }

type Props = {
  title: string
  description?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  /** Used for the empty state and the accessible table view. */
  data?: Row[]
  xKey?: string
  series?: Series[]
  formatX?: (v: never) => string
  formatValue?: (v: number) => string
  height?: number
  className?: string
  children: ReactNode
}

/**
 * Card wrapper for any chart: handles loading (skeleton), error, empty data,
 * and a "Tabela" toggle that shows the same data as a table (accessibility + exact values).
 */
export function ChartCard({
  title,
  description,
  loading,
  error,
  onRetry,
  data,
  xKey,
  series,
  formatX,
  formatValue = formatNumber,
  height = 260,
  className,
  children,
}: Props) {
  const [asTable, setAsTable] = useState(false)
  const canTable = !!(data?.length && xKey && series?.length)
  const fx = (formatX ?? String) as (v: unknown) => string

  let body: ReactNode
  if (loading) body = <ChartSkeleton height={height} />
  else if (error) body = <ErrorState message={error} onRetry={onRetry} />
  else if (data && data.length === 0) body = <EmptyState description="Brak danych do wyświetlenia na wykresie." />
  else if (asTable && canTable)
    body = (
      <div className="overflow-auto" style={{ maxHeight: height }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              {series!.map((s) => (
                <TableHead key={s.key} className="text-right">
                  {s.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data!.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{fx(row[xKey!])}</TableCell>
                {series!.map((s) => (
                  <TableCell key={s.key} className="text-right tabular-nums">
                    {typeof row[s.key] === 'number' ? formatValue(row[s.key] as number) : String(row[s.key] ?? '')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  else body = <div style={{ height }}>{children}</div>

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {canTable && !loading && !error && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
              {asTable ? 'Wykres' : 'Tabela'}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
