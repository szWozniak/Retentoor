import { useState } from 'react'
import { toast } from 'sonner'
import { Clock, FileText, Flag, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryBarChart, ChartCard, KpiCard, TimeSeriesChart, type Series } from '@/components/charts'
import { EmptyState } from '@/components/EmptyState'
import { useAsync } from '@/hooks/useAsync'
import { fetchDashboard } from '@/demo/dashboardData'
import { formatDateShort, formatNumber } from '@/lib/format'

/**
 * SHOWCASE of the reusable building blocks (charts, KPI tiles, toasts, skeletons, empty/error states).
 * Data is fake (src/demo/dashboardData.ts). Copy what you need into the real pages.
 */

const dailySeries: Series[] = [
  { key: 'zgloszenia', label: 'Zgłoszenia' },
  { key: 'rozpatrzone', label: 'Rozpatrzone' },
]
const categorySeries: Series[] = [{ key: 'liczba', label: 'Liczba zgłoszeń' }]
const regionSeries: Series[] = [
  { key: 'zamkniete', label: 'Zamknięte' },
  { key: 'otwarte', label: 'Otwarte' },
]

export default function DashboardPage() {
  const [fail, setFail] = useState(false)
  const { data, loading, error, reload } = useAsync(() => fetchDashboard({ fail }), [fail])
  const [showEmpty, setShowEmpty] = useState(false)

  const refresh = async () => {
    const t = toast.loading('Odświeżam dane…')
    await reload()
    toast.success('Dane odświeżone', { id: t })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="type-headline">Dashboard (demo)</h2>
          <p className="text-muted-foreground text-sm">Przykładowe dane, gotowe klocki do wykorzystania w zadaniu</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Odśwież
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFail((f) => !f)}>
            {fail ? 'Wyłącz błąd' : 'Symuluj błąd'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEmpty((e) => !e)}>
            {showEmpty ? 'Pokaż dane' : 'Pusty stan'}
          </Button>
        </div>
      </div>

      {/* Toast showcase */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => toast.success('Zapisano zmiany')}>Toast: sukces</Button>
        <Button size="sm" variant="secondary" onClick={() => toast.error('Nie udało się zapisać', { description: 'Serwer zwrócił 500' })}>
          Toast: błąd
        </Button>
        <Button size="sm" variant="secondary" onClick={() => toast.info('Nowe zgłoszenie w kolejce')}>Toast: info</Button>
        <Button size="sm" variant="secondary" onClick={() => toast('Usunięto rekord', { action: { label: 'Cofnij', onClick: () => toast.success('Przywrócono') } })}>
          Toast: z akcją
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.promise(new Promise((res) => setTimeout(res, 1500)), {
              loading: 'Analizuję plik…',
              success: 'Analiza zakończona',
              error: 'Błąd analizy',
            })
          }
        >
          Toast: promise
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          loading={loading}
          label="Wszystkie zgłoszenia"
          value={data && formatNumber(data.kpi.total)}
          delta={data?.kpi.totalDelta}
          hint="vs poprzednie 30 dni"
          icon={<FileText className="size-4" />}
        />
        <KpiCard
          loading={loading}
          label="Śr. czas rozpatrzenia"
          value={data && `${data.kpi.avgHours.toLocaleString('pl-PL')} h`}
          delta={data?.kpi.avgHoursDelta}
          upIsGood={false}
          hint="vs poprzednie 30 dni"
          icon={<Clock className="size-4" />}
        />
        <KpiCard
          loading={loading}
          label="Oznaczone jako ryzykowne"
          value={data && formatNumber(data.kpi.flagged)}
          delta={data?.kpi.flaggedDelta}
          upIsGood={false}
          icon={<Flag className="size-4" />}
        />
      </div>

      <ChartCard
        title="Zgłoszenia dziennie"
        description="Ostatnie 30 dni"
        loading={loading}
        error={error}
        onRetry={reload}
        data={showEmpty ? [] : data?.daily}
        xKey="date"
        series={dailySeries}
        formatX={formatDateShort as never}
      >
        {data && <TimeSeriesChart data={data.daily} xKey="date" series={dailySeries} formatX={formatDateShort as never} />}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Według kategorii"
          description="Ranking, ostatnie 30 dni"
          loading={loading}
          error={error}
          onRetry={reload}
          data={showEmpty ? [] : data?.categories}
          xKey="kategoria"
          series={categorySeries}
        >
          {data && (
            <CategoryBarChart data={data.categories} xKey="kategoria" series={categorySeries} orientation="horizontal" showValues />
          )}
        </ChartCard>

        <ChartCard
          title="Według województw"
          description="Otwarte vs zamknięte"
          loading={loading}
          error={error}
          onRetry={reload}
          data={showEmpty ? [] : data?.regions}
          xKey="wojewodztwo"
          series={regionSeries}
        >
          {data && <CategoryBarChart data={data.regions} xKey="wojewodztwo" series={regionSeries} stacked />}
        </ChartCard>
      </div>

      {showEmpty && (
        <EmptyState
          title="Nie ma jeszcze zgłoszeń"
          description="Wgraj plik lub dodaj pierwszy rekord, żeby zobaczyć statystyki."
          action={<Button size="sm" onClick={() => setShowEmpty(false)}>Wczytaj przykładowe dane</Button>}
        />
      )}
    </div>
  )
}
