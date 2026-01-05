import * as XLSX from 'xlsx'

export function rowsToXlsxBlob(rows: Record<string, unknown>[], sheetName = 'Line Items'): Blob {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function rowsToCsvBlob(rows: Record<string, unknown>[]): Blob {
  if (!rows.length) return new Blob([''], { type: 'text/csv;charset=utf-8' })

  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    // CSV-safe escaping
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replaceAll('"', '""')}"`
    return s
  }

  const lines: string[] = []
  lines.push(headers.join(','))
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','))
  }

  return new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
}
