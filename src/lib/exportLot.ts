import * as XLSX from 'xlsx'

type LineItem = {
  id: string
  lot_id: string
  description: string | null
  qty: number | null
  asking_price: number | null

  serial_tag: string | null
  model: string | null
  cpu: string | null
  cpu_qty: number | null
  memory_part_numbers: string | null
  memory_qty: number | null
  network_card: string | null
  expansion_card: string | null
  gpu: string | null

  specs: Record<string, unknown> | null
}

export type ExportRow = Record<string, unknown>

function safe(v: unknown) {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

function numOrNull(v: unknown) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function jsonStringify(v: unknown) {
  try {
    return v ? JSON.stringify(v) : null
  } catch {
    return null
  }
}

/**
 * Convert line_items -> flat rows for export.
 * We keep a stable core schema + include full specs as JSON.
 */
export function buildLotExportRows(items: LineItem[], currency: string): ExportRow[] {
  return items.map((it) => {
    const specsObj = it.specs && typeof it.specs === 'object' ? it.specs : null
    const meta = specsObj?._meta ?? null

    return {
      line_item_id: it.id,
      lot_id: it.lot_id,

      serial_tag: safe(it.serial_tag),
      model: safe(it.model),
      description: safe(it.description),

      qty: numOrNull(it.qty),
      asking_price: numOrNull(it.asking_price),
      currency,

      cpu: safe(it.cpu),
      cpu_qty: numOrNull(it.cpu_qty),

      memory_part_numbers: safe(it.memory_part_numbers),
      memory_qty: numOrNull(it.memory_qty),

      network_card: safe(it.network_card),
      expansion_card: safe(it.expansion_card),
      gpu: safe(it.gpu),

      source_file: meta?.source_file ?? null,
      header_row: meta?.header_row ?? null,

      // Keep everything else in a JSON column so nothing is lost
      specs_json: jsonStringify(specsObj),
    }
  })
}

function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // escape quotes and wrap in quotes if needed
  const needsQuotes = /[",\n\r]/.test(s)
  const escaped = s.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}

export function exportRowsToCsv(rows: ExportRow[], filename: string) {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const lines: string[] = []

  lines.push(headers.map(toCsvValue).join(','))
  for (const r of rows) {
    lines.push(headers.map((h) => toCsvValue(r[h])).join(','))
  }

  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}

export function exportRowsToXlsx(rows: ExportRow[], filename: string, sheetName = 'Line Items') {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // This triggers a download in the browser
  XLSX.writeFile(wb, filename, { compression: true })
}
