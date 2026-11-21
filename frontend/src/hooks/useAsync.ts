import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

export type AsyncState<T> = {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => Promise<void>
}

/**
 * Runs an async loader on mount (and when deps change).
 * `const { data, loading, error, reload } = useAsync(() => api.listRecords(q), [q])`
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList = []): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const callId = useRef(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async () => {
    const id = ++callId.current
    setLoading(true)
    try {
      const result = await run()
      if (id === callId.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      if (id === callId.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === callId.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload }
}
