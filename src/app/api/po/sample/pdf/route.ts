import { NextResponse } from 'next/server'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

export const runtime = 'nodejs'

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11, fontFamily: 'Helvetica' },
  header: { fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#666', fontSize: 10 },
  value: { fontSize: 11 },
  tableHeader: { flexDirection: 'row', borderBottom: '1 solid #999', paddingBottom: 4, marginTop: 12 },
  cell: { flex: 1, fontSize: 10 },
  cellWide: { flex: 2, fontSize: 10 },
  line: { flexDirection: 'row', paddingVertical: 4, borderBottom: '0.5 solid #e5e5e5' },
  footer: { marginTop: 14, fontSize: 10, color: '#555', lineHeight: 1.4 },
})

function buildSampleDoc() {
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
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: { ...styles.row, marginBottom: 12 } },
        React.createElement(Text, { style: { ...styles.header, color: '#1E3A5F' } }, 'Purchase Order'),
        React.createElement(Text, { style: { fontSize: 11 } }, `PO#: SAMPLE-1000`),
      ),
      React.createElement(
        View,
        { style: { ...styles.row, marginBottom: 10 } },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, 'Buyer'),
          React.createElement(Text, { style: styles.value }, 'Sample Buyer'),
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, 'Supplier'),
          React.createElement(Text, { style: styles.value }, 'The IT Exchange'),
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, 'Date'),
          React.createElement(Text, { style: styles.value }, new Date().toLocaleDateString()),
        ),
      ),
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(Text, { style: { ...styles.cell } }, 'SKU'),
        React.createElement(Text, { style: { ...styles.cellWide } }, 'Description'),
        React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, 'Qty'),
        React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, 'Unit (USD)'),
        React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, 'Line (USD)'),
      ),
      lines.map((l, idx) =>
        React.createElement(
          View,
          { key: idx, style: styles.line },
          React.createElement(Text, { style: { ...styles.cell } }, l.sku),
          React.createElement(Text, { style: { ...styles.cellWide } }, l.desc),
          React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, String(l.qty)),
          React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, l.price.toFixed(2)),
          React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, (l.qty * l.price).toFixed(2)),
        ),
      ),
      React.createElement(
        View,
        { style: { ...styles.row, marginTop: 10 } },
        React.createElement(Text, { style: styles.label }, 'Total (USD)'),
        React.createElement(Text, { style: { fontSize: 12, fontWeight: 'bold' } }, total.toFixed(2)),
      ),
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, { style: { fontWeight: 'bold', marginBottom: 4 } }, 'Terms'),
        React.createElement(Text, null, 'Payment due within 30 days. Delivery within 7 business days.'),
      ),
    ),
  )
}

export async function GET() {
  try {
    const doc = buildSampleDoc()
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
