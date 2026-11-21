import { useState } from 'react'
import { api, type UploadResult } from '@/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function UploadPage() {
  const [result, setResult] = useState<UploadResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      setResult(await api.upload(file))
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const preview = result?.preview
  return (
    <Card>
      <CardHeader>
        <CardTitle>Wgraj plik</CardTitle>
        <CardDescription>CSV / XLSX / JSON → podgląd danych</CardDescription>
      </CardHeader>
      <CardContent>
        <Input type="file" className="mb-3 max-w-sm" onChange={(e) => onFile(e.target.files?.[0])} />
        {busy && <p className="text-muted-foreground text-sm">Wysyłanie…</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {result && (
          <p className="text-muted-foreground mb-2 text-sm">
            {result.filename} · {(result.size / 1024).toFixed(1)} KB
            {preview && 'rows' in preview && ` · ${preview.rows} wierszy`}
          </p>
        )}
        {preview && 'error' in preview && <p className="text-destructive text-sm">{preview.error}</p>}
        {preview && 'columns' in preview && (
          <Table>
            <TableHeader>
              <TableRow>
                {preview.columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.head.map((row, i) => (
                <TableRow key={i}>
                  {preview.columns.map((c) => (
                    <TableCell key={c}>{String(row[c] ?? '')}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
