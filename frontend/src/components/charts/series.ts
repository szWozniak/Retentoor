import type { ChartConfig } from '@/components/ui/chart'

/**
 * One data series. `key` = field in each data row.
 * Colors come from the validated categorical palette (--chart-1..8) in FIXED order:
 * series[0] -> slot 1, series[1] -> slot 2, ... Pass `slot` explicitly to keep an
 * entity's color stable when you filter series out (color follows the entity, not its rank).
 * Max 8 series; fold the rest into "Inne".
 */
export type Series = {
  key: string
  label: string
  slot?: number // 1..8
}

export const MAX_SERIES = 8

export function seriesColor(slot: number) {
  return `var(--chart-${((slot - 1) % MAX_SERIES) + 1})`
}

export function toChartConfig(series: Series[]): ChartConfig {
  if (series.length > MAX_SERIES && import.meta.env.DEV) {
    console.warn(`Chart has ${series.length} series; max ${MAX_SERIES}. Fold the rest into "Inne".`)
  }
  return Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: seriesColor(s.slot ?? i + 1) }]),
  )
}
