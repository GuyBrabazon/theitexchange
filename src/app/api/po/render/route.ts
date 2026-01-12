import { NextResponse, NextRequest } from 'next/server'
import { chromium as playwright } from 'playwright-core'
import chromium from '@sparticuz/chromium'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type RenderRequest = {
  po_id?: string
  preview?: boolean
  settings?: Partial<{
    po_logo_path: string | null
    po_brand_color: string | null
    po_brand_color_secondary: string | null
    po_terms: string | null
    po_header: string | null
    default_currency: string | null
  }>
}

type Line = { sku: string; desc: string; qty: number; price: number }

const defaultLines: Line[] = [
  { sku: 'R740', desc: 'Dell PowerEdge R740', qty: 2, price: 2500 },
  { sku: 'MEM-128', desc: '128GB DDR4 Kit', qty: 4, price: 320 },
]

function renderHtml(data: {
  tenantName: string
  buyerName: string
  poNumber: string
  dateLabel: string
  currency: string
  lines: Line[]
  terms?: string | null
  headerText?: string | null
  logo?: string | null
  color?: string | null
}) {
  const total = data.lines.reduce((s, l) => s + l.qty * l.price, 0)
  const color = data.color || '#1E3A5F'
  const lineRows = data.lines
    .map(
      (l) => `
      <tr>
        <td>${l.sku}</td>
        <td>${l.desc}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${l.price.toFixed(2)}</td>
        <td class="num">${(l.qty * l.price).toFixed(2)}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 24px; color: #1f2933; }
    .card { border: 1px solid #d6dce3; border-radius: 12px; padding: 20px; }
    .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .header { font-size: 22px; font-weight: 800; color: ${color}; margin: 0; }
    .muted { color: #5b6773; font-size: 12px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { text-align: left; border-bottom: 1px solid #d6dce3; padding: 8px 6px; font-size: 12px; }
    td { padding: 8px 6px; border-bottom: 1px solid #f0f2f5; font-size: 12px; }
    .num { text-align: right; }
    .terms { margin-top: 14px; font-size: 12px; color: #444; white-space: pre-wrap; }
    .logo { max-height: 48px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div>
        <h1 class="header">${data.headerText || 'Purchase Order'}</h1>
        <div class="muted">${data.tenantName}</div>
      </div>
      <div style="text-align:right">
        <div class="muted">PO#</div>
        <div style="font-weight:700">${data.poNumber}</div>
        <div class="muted">${data.dateLabel}</div>
      </div>
    </div>
    <div style="display:flex; gap:16px; margin-top:12px;">
      <div style="flex:1;">
        <div style="font-weight:700;">Buyer</div>
        <div class="muted">${data.buyerName}</div>
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;">Supplier</div>
        <div class="muted">${data.tenantName}</div>
      </div>
      ${data.logo ? `<div style="flex:0 0 auto;"><img class="logo" src="${data.logo}" /></div>` : ''}
    </div>
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit (${data.currency})</th>
          <th class="num">Line (${data.currency})</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
    <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:10px; font-weight:800;">
      <span>Total (${data.currency})</span>
      <span>${total.toFixed(2)}</span>
    </div>
    <div class="terms">
      <div style="font-weight:700; margin-bottom:4px;">Terms</div>
      ${data.terms || 'Payment due within 30 days. Delivery within 7 business days.'}
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as RenderRequest
    const isPreview = !!body.preview
    const supa = supabaseServer()

    let tenantName = 'The IT Exchange'
    let buyerName = 'Sample Buyer'
    let lines: Line[] = defaultLines
    let currency = 'USD'
    let poNumber = 'SAMPLE-1000'
    let terms: string | null | undefined = 'Payment due within 30 days. Delivery within 7 business days.'
    let headerText: string | null | undefined = 'Purchase Order'
    let logo: string | null | undefined = null
    let color: string | null | undefined = '#1E3A5F'

    if (!isPreview) {
      if (!body.po_id) return NextResponse.json({ ok: false, message: 'po_id required' }, { status: 400 })
      const { data: poRow, error: poErr } = await supa.from('purchase_orders').select('*').eq('id', body.po_id).maybeSingle()
      if (poErr) throw poErr
      if (!poRow) return NextResponse.json({ ok: false, message: 'PO not found' }, { status: 404 })
      const tenantId = poRow.tenant_id as string

      const { data: tsRow } = await supa.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
      const { data: tRow } = await supa.from('tenants').select('name').eq('id', tenantId).maybeSingle()
      tenantName = (tRow?.name as string) || tenantName
      color = (tsRow?.po_brand_color as string) || color
      logo = (tsRow?.po_logo_path as string) || null
      terms = (tsRow?.po_terms as string) || terms
      headerText = (tsRow?.po_header as string) || headerText
      currency = (poRow.currency as string) || (tsRow?.default_currency as string) || currency
      poNumber = (poRow.po_number as string) || poNumber

      if (poRow.buyer_id) {
        const { data: buyerRow } = await supa.from('buyers').select('name,company').eq('id', poRow.buyer_id).maybeSingle()
        if (buyerRow) buyerName = (buyerRow.name as string) || (buyerRow.company as string) || buyerName
      }

      if (poRow.lot_id) {
        const { data: liRows } = await supa.from('line_items').select('line_ref,model,description,qty,asking_price').eq('lot_id', poRow.lot_id).limit(2000)
        const mapped =
          liRows?.map((r) => ({
            sku: (r as { line_ref?: string | null; model?: string | null }).line_ref || (r as { model?: string | null }).model || 'Item',
            desc:
              (r as { description?: string | null }).description ||
              (r as { model?: string | null }).model ||
              'Item',
            qty: Number((r as { qty?: number | null }).qty ?? 1) || 1,
            price: Number((r as { asking_price?: number | null }).asking_price ?? 0) || 0,
          })) ?? []
        if (mapped.length) lines = mapped
      }
    } else {
      // preview uses supplied settings if provided
      const s = body.settings || {}
      color = s.po_brand_color || color
      logo = s.po_logo_path || logo
      terms = s.po_terms || terms
      headerText = s.po_header || headerText
      currency = s.default_currency || currency
      tenantName = 'Preview Supplier'
      buyerName = 'Preview Buyer'
      poNumber = 'PREVIEW-1000'
    }

    const html = renderHtml({
      tenantName,
      buyerName,
      poNumber,
      dateLabel: new Date().toLocaleDateString(),
      currency,
      lines,
      terms,
      headerText,
      logo,
      color,
    })

    const executablePath = await chromium.executablePath()
    const browser = await playwright.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    })
    const page = await browser.newPage({ viewport: { width: 1280, height: 1800 } })
    await page.setContent(html, { waitUntil: 'networkidle' })
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } })
    await browser.close()

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="po-preview.pdf"',
      },
    })
  } catch (e) {
    console.error('po render error', e)
    const msg = e instanceof Error ? e.message : 'Failed to render PO PDF'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
