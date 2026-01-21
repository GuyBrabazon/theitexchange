export type EmailLine = {
  lineRef: string
  model: string | null
  description: string | null
  qty: number | null
}

type BatchBodyOptions = {
  lines: EmailLine[]
  currencySymbol: string
  buyerName?: string | null
}

const currencySymbols: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  ZAR: 'R',
}

export function getCurrencySymbol(code: string | null | undefined) {
  if (!code) return '$'
  return currencySymbols[code.toUpperCase()] ?? '$'
}

export function buildBatchSubject(batchKey: string, lotLabel: string) {
  const prefix = lotLabel || 'Lot'
  return `${prefix} batch - ${batchKey}`
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildBatchBody({ lines, currencySymbol, buyerName }: BatchBodyOptions) {
  const greeting = `Hi ${escapeHtml(buyerName?.trim() || '{Buyer_Name}')},`
  const instruction = '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;margin-top:0">Reply to this email and fill the Offer column. Keep the table intact.</p>'
  const headers = ['Line Ref', 'P/N', 'Description', 'QTY', `Offer (${currencySymbol})`]
  const headerRow = headers
    .map((col) => `<th style="border:1px solid #d1d5db;background:#f9fafb;padding:8px;text-align:left;font-size:13px">${escapeHtml(col)}</th>`)
    .join('')
  const tableRows = lines
    .map((line) => {
      const qty = line.qty == null ? '—' : String(line.qty)
      const rowCells = [line.lineRef || '—', line.model || '—', line.description || '—', qty, '&nbsp;']
      return `<tr>${rowCells
        .map((cell) => {
          const safeCell = cell === '&nbsp;' ? cell : escapeHtml(cell)
          return `<td style="border:1px solid #e5e7eb;padding:8px;font-size:13px;line-height:1.4;font-family:Arial,Helvetica,sans-serif">${safeCell}</td>`
        })
        .join('')}</tr>`
    })
    .join('')
  const table =
    `<table style="border-collapse:collapse;width:100%;margin-top:8px;font-family:Arial,Helvetica,sans-serif"><thead><tr>${headerRow}</tr></thead><tbody>${tableRows}</tbody></table>`
  const footer = '<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;margin-top:8px">Do not change the Line Ref column — it uniquely identifies each row.</p>'
  const parseInfo =
    '<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;margin-top:4px;color:#6b7280">Offer interpretation: plain numeric values are treated as per-unit pricing; prefix with “total:” if you are quoting a line total.</p>'
  return `<div>${greeting}${instruction}${table}${footer}${parseInfo}</div>`
}
