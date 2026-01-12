import { NextResponse } from 'next/server'
import React from 'react'
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'

export const runtime = 'nodejs'

function buildSimpleDoc() {
  const lines = [
    { sku: 'R740', desc: 'Dell PowerEdge R740', qty: 2, price: 2500 },
    { sku: 'MEM-128', desc: '128GB DDR4 Kit', qty: 4, price: 320 },
  ]
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0)
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: { padding: 32, fontSize: 11, fontFamily: 'Helvetica' } },
      React.createElement(Text, { style: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 } }, 'Purchase Order'),
      React.createElement(Text, { style: { marginBottom: 12 } }, `PO#: SAMPLE-1000  •  Date: ${new Date().toLocaleDateString()}`),
      React.createElement(
        View,
        { style: { marginBottom: 12 } },
        React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Supplier'),
        React.createElement(Text, null, 'The IT Exchange'),
      ),
      React.createElement(
        View,
        { style: { marginBottom: 12 } },
        React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Buyer'),
        React.createElement(Text, null, 'Sample Buyer'),
      ),
      React.createElement(
        View,
        { style: { borderTop: '1 solid #999', borderBottom: '1 solid #999', paddingVertical: 6, marginBottom: 6 } },
        React.createElement(
          View,
          { style: { flexDirection: 'row', fontWeight: 'bold' } },
          React.createElement(Text, { style: { flex: 1 } }, 'SKU'),
          React.createElement(Text, { style: { flex: 2 } }, 'Description'),
          React.createElement(Text, { style: { flex: 1, textAlign: 'right' } }, 'Qty'),
          React.createElement(Text, { style: { flex: 1, textAlign: 'right' } }, 'Unit'),
          React.createElement(Text, { style: { flex: 1, textAlign: 'right' } }, 'Line'),
        ),
        lines.map((l, idx) =>
          React.createElement(
            View,
            { key: idx, style: { flexDirection: 'row', paddingVertical: 4, borderTop: '0.5 solid #e5e5e5' } },
            React.createElement(Text, { style: { flex: 1 } }, l.sku),
            React.createElement(Text, { style: { flex: 2 } }, l.desc),
            React.createElement(Text, { style: { flex: 1, textAlign: 'right' } }, String(l.qty)),
            React.createElement(Text, { style: { flex: 1, textAlign: 'right' } }, l.price.toFixed(2)),
            React.createElement(Text, { style: { flex: 1, textAlign: 'right' } }, (l.qty * l.price).toFixed(2)),
          ),
        ),
      ),
      React.createElement(
        View,
        { style: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 } },
        React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Total (USD)'),
        React.createElement(Text, { style: { fontWeight: 'bold' } }, total.toFixed(2)),
      ),
      React.createElement(
        View,
        { style: { marginTop: 12 } },
        React.createElement(Text, { style: { fontWeight: 'bold' } }, 'Terms'),
        React.createElement(Text, null, 'Payment due within 30 days. Delivery within 7 business days.'),
      ),
    ),
  )
}

export async function GET() {
  try {
    const doc = buildSimpleDoc()
    const buffer = await pdf(doc).toBuffer()
    return new NextResponse(buffer as unknown as BodyInit, {
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
