import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const sampleLines = [
  { sku: 'R740', desc: 'Dell PowerEdge R740', qty: 2, price: 2500 },
  { sku: 'MEM-128', desc: '128GB DDR4 Kit', qty: 4, price: 320 },
]

function buildHtml() {
  const total = sampleLines.reduce((s, l) => s + l.qty * l.price, 0)
  const lineRows = sampleLines
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
    .header { font-size: 22px; font-weight: 800; color: #1E3A5F; margin: 0; }
    .muted { color: #5b6773; font-size: 12px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { text-align: left; border-bottom: 1px solid #d6dce3; padding: 8px 6px; font-size: 12px; }
    td { padding: 8px 6px; border-bottom: 1px solid #f0f2f5; font-size: 12px; }
    .num { text-align: right; }
    .terms { margin-top: 14px; font-size: 12px; color: #444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="top">
      <div>
        <h1 class="header">Purchase Order</h1>
        <div class="muted">The IT Exchange</div>
      </div>
      <div style="text-align:right">
        <div class="muted">PO#</div>
        <div style="font-weight:700">SAMPLE-1000</div>
        <div class="muted">${new Date().toLocaleDateString()}</div>
      </div>
    </div>
    <div style="display:flex; gap:16px; margin-top:12px;">
      <div style="flex:1;">
        <div style="font-weight:700;">Buyer</div>
        <div class="muted">Sample Buyer</div>
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;">Supplier</div>
        <div class="muted">The IT Exchange</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit (USD)</th>
          <th class="num">Line (USD)</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>
    <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:10px; font-weight:800;">
      <span>Total (USD)</span>
      <span>${total.toFixed(2)}</span>
    </div>
    <div class="terms">
      <div style="font-weight:700; margin-bottom:4px;">Terms</div>
      Payment due within 30 days. Delivery within 7 business days.
    </div>
  </div>
</body>
</html>`
}

export async function GET() {
  try {
    const html = buildHtml()
    const apiKeyRaw = process.env.PDFSHIFT_API_KEY
    const apiKey = apiKeyRaw?.trim()
    console.log('pdfshift_key_present', apiKey ? apiKey.length : 0)
    if (!apiKey) return NextResponse.json({ ok: false, message: 'PDFShift API key missing' }, { status: 500 })

    const res = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: html,
        landscape: false,
        use_print: true,
      }),
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`PDFShift error: ${res.status} ${txt}`)
    }
    const arrayBuffer = await res.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="sample-po.pdf"',
      },
    })
  } catch (e) {
    console.error('sample po pdf error', e)
    const msg = e instanceof Error ? e.message : 'Failed to generate sample PO PDF'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
