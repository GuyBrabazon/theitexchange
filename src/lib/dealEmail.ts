const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ZAR: 'R',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  AED: 'د.إ',
}

const inlineTableStyle = `border-collapse:collapse;font-family:var(--font-body);width:100%;`
const headerStyle = `font-weight:600;border:1px solid #ccc;padding:8px;background:#f5f5f5;text-align:left;`
const cellStyle = `border:1px solid #ccc;padding:8px;text-align:left;`

export function getCurrencySymbol(code?: string | null) {
  if (!code) return '$'
  return currencySymbols[code.toUpperCase()] ?? '$'
}

export function buildDealSubject(subjectTemplate: string, subjectKey: string) {
  if (!subjectTemplate) {
    return `Re: Deal conversation [${subjectKey}]`
  }
  const replaced = subjectTemplate.replace(/\[DL-[A-Z0-9]{6,10}\]/i, `[${subjectKey}]`)
  if (replaced === subjectTemplate) {
    return `${subjectTemplate} [${subjectKey}]`
  }
  return replaced
}

export function buildDealBody(options: {
  lines: { line_ref: string; model: string | null; description: string | null; qty: number | null; ask_price: number | null; currency: string | null }[]
  buyerName?: string | null
  message?: string
  currencySymbol: string
}) {
  const greeting = options.buyerName ? `Hi ${options.buyerName},` : 'Hi there,'
  const intro = options.message ?? 'Reply to this email with your offer in the “Offer” column.'
  const tableRows = options.lines
    .map((line) => {
      const model = line.model ?? line.description ?? '-'
      const desc = line.description ?? line.model ?? '-'
      const ask = line.ask_price != null ? `${line.ask_price.toFixed(2)} ${line.currency ?? ''}`.trim() : 'TBD'
      return `<tr>
        <td style="${cellStyle}">${line.line_ref}</td>
        <td style="${cellStyle}">${model}</td>
        <td style="${cellStyle}">${desc}</td>
        <td style="${cellStyle};text-align:right">${line.qty ?? 1}</td>
        <td style="${cellStyle};text-align:right">${ask}</td>
        <td style="${cellStyle}">&nbsp;</td>
      </tr>`
    })
    .join('')

  const table = `<table style="${inlineTableStyle}">
    <thead>
      <tr>
        <th style="${headerStyle}">Line Ref</th>
        <th style="${headerStyle}">P/N</th>
        <th style="${headerStyle}">Description</th>
        <th style="${headerStyle};text-align:right">Qty</th>
        <th style="${headerStyle};text-align:right">Asking</th>
        <th style="${headerStyle}">Offer (${options.currencySymbol})</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>`

  return `
    <div style="font-family:${'Geist Sans'},'Inter',sans-serif;font-size:14px;line-height:1.5;">
      <p>${greeting}</p>
      <p>${intro}</p>
      <div style="margin:12px 0;">
        ${table}
      </div>
      <p style="font-size:12px;color:#6b7280;margin:0;">Do not change the Line Ref column — it uniquely identifies each row.</p>
    </div>
  `
}
