/**
 * Fake data for the /dashboard showcase. Replace with real API calls once the challenge is known.
 * `fetchDashboard()` simulates network latency so skeletons are visible.
 */

export type DailyPoint = { date: string; zgloszenia: number; rozpatrzone: number }
export type CategoryPoint = { kategoria: string; liczba: number }
export type RegionPoint = { wojewodztwo: string; otwarte: number; zamkniete: number }

export type DashboardData = {
  kpi: { total: number; totalDelta: number; avgHours: number; avgHoursDelta: number; flagged: number; flaggedDelta: number }
  daily: DailyPoint[]
  categories: CategoryPoint[]
  regions: RegionPoint[]
}

// deterministic pseudo-random so the demo looks the same on every reload
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
}

function build(): DashboardData {
  const r = rng(42)
  const today = new Date()
  const daily: DailyPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (29 - i))
    const base = 120 + i * 3 + Math.sin(i / 3) * 25
    const z = Math.round(base + r() * 30)
    return { date: d.toISOString().slice(0, 10), zgloszenia: z, rozpatrzone: Math.round(z * (0.7 + r() * 0.2)) }
  })
  const categories: CategoryPoint[] = [
    { kategoria: 'Fałszywe reklamy', liczba: 412 },
    { kategoria: 'Phishing', liczba: 356 },
    { kategoria: 'Kryptowaluty', liczba: 241 },
    { kategoria: 'Inwestycje', liczba: 198 },
    { kategoria: 'Dezinformacja', liczba: 143 },
    { kategoria: 'Inne', liczba: 87 },
  ]
  const regions: RegionPoint[] = ['mazowieckie', 'śląskie', 'wielkopolskie', 'małopolskie', 'kujawsko-pom.', 'pomorskie'].map(
    (w) => ({ wojewodztwo: w, otwarte: Math.round(40 + r() * 80), zamkniete: Math.round(60 + r() * 120) }),
  )
  return {
    kpi: { total: 4362, totalDelta: 0.124, avgHours: 18.5, avgHoursDelta: -0.08, flagged: 237, flaggedDelta: 0.031 },
    daily,
    categories,
    regions,
  }
}

export async function fetchDashboard({ fail = false } = {}): Promise<DashboardData> {
  await new Promise((res) => setTimeout(res, 1200))
  if (fail) throw new Error('Symulowany błąd serwera (500)')
  return build()
}
