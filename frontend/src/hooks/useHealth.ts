import { useCallback, useEffect, useState } from 'react'
import { api, type Health } from '@/api'

export type HealthState = {
  data: Health | null
  error: string | null
  latencyMs: number | null
  checkedAt: Date | null
  loading: boolean
  refresh: () => void
}

/** Polls /api/health every `intervalMs` (0 = only once). */
export function useHealth(intervalMs = 5000): HealthState {
  const [data, setData] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [latencyMs, setLatency] = useState<number | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const t0 = performance.now()
    try {
      setData(await api.health())
      setError(null)
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLatency(Math.round(performance.now() - t0))
      setCheckedAt(new Date())
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    if (!intervalMs) return
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  return { data, error, latencyMs, checkedAt, loading, refresh }
}
