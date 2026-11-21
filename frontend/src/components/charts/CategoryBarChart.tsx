import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { formatCompact, formatNumber } from '@/lib/format'
import { toChartConfig, type Series } from './series'

type Props<T> = {
  data: T[]
  /** Category field (e.g. "kategoria"). */
  xKey: keyof T & string
  series: Series[]
  /** "horizontal" = bars grow left->right; best for long category names / rankings. */
  orientation?: 'vertical' | 'horizontal'
  stacked?: boolean
  /** Print values at bar ends (only for single-series rankings; never on every bar of a dense chart). */
  showValues?: boolean
  formatValue?: (v: number) => string
  height?: number
}

/** Shorten long category labels on the axis; the tooltip still shows the full name. */
const truncate = (v: unknown, max = 12) => {
  const t = String(v)
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Compare magnitudes across categories. Hover any bar for its value. */
export function CategoryBarChart<T extends object>({
  data,
  xKey,
  series,
  orientation = 'vertical',
  stacked = false,
  showValues = false,
  formatValue = formatNumber,
  height = 260,
}: Props<T>) {
  const config = toChartConfig(series)
  const horizontal = orientation === 'horizontal'
  // 4px rounded data-end, square at the baseline
  const radius: [number, number, number, number] = horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ left: 4, right: showValues ? 40 : 12, top: 8 }}
        barCategoryGap="20%"
        barGap={2}
      >
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatCompact} />
            <YAxis type="category" dataKey={xKey as never} tickLine={false} axisLine={false} width={120} tickFormatter={(v) => truncate(v, 18)} />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey as never}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              tickFormatter={(v) => truncate(v, 14)}
              // many categories -> slanted labels so they don't collide
              {...(data.length > 4 ? { angle: -35, textAnchor: 'end', height: 64 } : {})}
            />
            <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={formatCompact} />
          </>
        )}
        <ChartTooltip
          cursor={{ fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[2px]" style={{ background: `var(--color-${name})` }} />
                    <span className="text-muted-foreground">{config[name as string]?.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatValue(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        {series.length > 1 && <ChartLegend itemSorter={null} content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={`var(--color-${s.key})`}
            stackId={stacked ? 'stack' : undefined}
            // in a stack only the last segment gets rounded ends; 2px surface gap between segments
            radius={!stacked || i === series.length - 1 ? radius : 0}
            stroke={stacked ? 'var(--card)' : undefined}
            strokeWidth={stacked ? 2 : 0}
            maxBarSize={48}
          >
            {showValues && series.length === 1 && (
              <LabelList
                dataKey={s.key}
                position={horizontal ? 'right' : 'top'}
                className="fill-foreground"
                fontSize={12}
                formatter={(v: unknown) => formatValue(Number(v))}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  )
}
