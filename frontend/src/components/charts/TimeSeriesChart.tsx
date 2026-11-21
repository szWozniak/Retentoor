import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
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
  xKey: keyof T & string
  series: Series[]
  /** "line" (default) for comparing trends, "area" for a single series' volume. */
  variant?: 'line' | 'area'
  formatX?: (v: never) => string
  formatValue?: (v: number) => string
  height?: number
}

/** Change over time. Hover shows a crosshair + tooltip with all series. */
export function TimeSeriesChart<T extends object>({
  data,
  xKey,
  series,
  variant = 'line',
  formatX = String as never,
  formatValue = formatNumber,
  height = 260,
}: Props<T>) {
  const config = toChartConfig(series)
  const fx = formatX as (v: unknown) => string
  const Chart = variant === 'area' ? AreaChart : LineChart

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <Chart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={xKey as never} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={fx} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={formatCompact} />
        <ChartTooltip
          cursor
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, p) => fx(p?.[0]?.payload?.[xKey])}
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
        {series.map((s) =>
          variant === 'area' ? (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              fill={`var(--color-${s.key})`}
              fillOpacity={0.15}
              strokeWidth={2}
              activeDot={{ r: 4 }}
            />
          ) : (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ),
        )}
      </Chart>
    </ChartContainer>
  )
}
