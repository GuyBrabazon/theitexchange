const CELL_REGEX = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi
const ROW_REGEX = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
const TABLE_REGEX = /<table[^>]*>([\s\S]*?)<\/table>/gi

export type OfferRow = {
  lineRef: string
  qty: string
  offer: string
}

export function stripHtml(value: string) {
  return value.replace(/<\/?[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
}

export function extractCells(rowHtml: string) {
  const cells: string[] = []
  let match
  while ((match = CELL_REGEX.exec(rowHtml))) {
    cells.push(stripHtml(match[1]))
  }
  return cells
}

export function extractRows(tableHtml: string) {
  const rows: string[] = []
  let match
  while ((match = ROW_REGEX.exec(tableHtml))) {
    rows.push(match[1])
  }
  return rows
}

export function findOfferTableRows(html: string) {
  if (!html) return []
  let tableMatch
  while ((tableMatch = TABLE_REGEX.exec(html))) {
    const tableContent = tableMatch[1]
    const rows = extractRows(tableContent)
    if (!rows.length) continue
    const headerCells = extractCells(rows[0])
    const normalized = headerCells.map((cell) => cell.toLowerCase().trim())
    const lineRefIdx = normalized.findIndex((text) => text.includes('line ref'))
    const offerIdx = normalized.findIndex((text) => text.includes('offer'))
    if (lineRefIdx < 0 || offerIdx < 0) continue
    const qtyIdx = normalized.findIndex((text) => text.includes('qty'))
    const parsed: OfferRow[] = []
    for (let i = 1; i < rows.length; i += 1) {
      const cells = extractCells(rows[i])
      parsed.push({
        lineRef: cells[lineRefIdx] ?? '',
        qty: qtyIdx >= 0 ? cells[qtyIdx] ?? '' : '',
        offer: cells[offerIdx] ?? '',
      })
    }
    if (parsed.length) {
      return parsed
    }
  }
  return []
}

export function parseQty(value: string | null | undefined) {
  if (!value) return null
  const cleaned = value.replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return Math.round(num)
}

export function parseOfferValue(value: string | null | undefined): { amount: number | null; type: 'per_unit' | 'total_line' } {
  if (!value) return { amount: null as number | null, type: 'per_unit' as const }
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed || trimmed === '&nbsp;') return { amount: null, type: 'per_unit' }
  const lower = trimmed.toLowerCase()
  let type: 'per_unit' | 'total_line' = 'per_unit'
  let candidate = trimmed
  if (lower.startsWith('total:')) {
    type = 'total_line'
    candidate = trimmed.slice(trimmed.indexOf(':') + 1)
  } else if (lower.startsWith('total ')) {
    type = 'total_line'
    candidate = trimmed.slice(5)
  }
  const cleaned = candidate.replace(/[^\d.-]/g, '')
  if (!cleaned) return { amount: null, type }
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return { amount: null, type }
  return { amount: num, type }
}

export function normalizeLineRef(value: string) {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

const DEAL_KEY_REGEX = /\[DL-([A-Z0-9]{6,10})\]/i

export function normalizeDealSubjectKey(subject: string | null | undefined) {
  if (!subject) return null
  const match = subject.match(DEAL_KEY_REGEX)
  if (!match) return null
  return `DL-${match[1].toUpperCase()}`
}
