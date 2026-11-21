export type Record = {
  id: number
  title: string
  content: string
  label: string | null
  source: string | null
  created_at: string
}

export type RecordInput = Pick<Record, 'title' | 'content'> & Partial<Pick<Record, 'label' | 'source'>>

export type UploadResult = {
  id: string
  filename: string
  size: number
  preview:
    | { rows: number; columns: string[]; head: { [key: string]: unknown }[] }
    | { error: string }
    | null
}

export type Health = {
  status: 'ok' | 'degraded'
  app: string
  db: 'ok' | 'error'
  uptime_s: number
  server_time: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<Health>('/health'),
  listRecords: (q = '') => request<Record[]>(`/records${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  createRecord: (data: RecordInput) => request<Record>('/records', json('POST', data)),
  updateRecord: (id: number, data: Partial<RecordInput>) => request<Record>(`/records/${id}`, json('PATCH', data)),
  deleteRecord: (id: number) => request<void>(`/records/${id}`, { method: 'DELETE' }),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadResult>('/files', { method: 'POST', body: form })
  },
}
