import { NextResponse, NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'

export const runtime = 'nodejs'

type TenantSettings = {
  po_logo_path?: string | null
  po_brand_color?: string | null
  po_brand_color_secondary?: string | null
  po_terms?: string | null
  po_header?: string | null
  po_number_start?: number | null
  po_number_current?: number | null
  default_currency?: string | null
}

type PurchaseOrderRow = {
  id: string
  tenant_id: string
  lot_id: string | null
  buyer_id: string | null
  notes: string | null
  created_at: string | null
  po_number: string | null
  pdf_path: string | null
}

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

function buildDoc(opts: {
  tenantName: string
  buyerName: string
  poNumber: string
  createdAt: string
  currency: string
  lines: Array<{ sku: string; desc: string; qty: number; price: number }>
  brandColor: string
  terms?: string | null
  headerText?: string | null
}) {
  const total = opts.lines.reduce((s, l) => s + l.qty * l.price, 0)
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: { ...styles.row, marginBottom: 12 } },
        React.createElement(Text, { style: { ...styles.header, color: opts.brandColor || '#1E3A5F' } }, opts.headerText || 'Purchase Order'),
        React.createElement(Text, { style: { fontSize: 11 } }, `PO#: ${opts.poNumber}`),
      ),
      React.createElement(
        View,
        { style: { ...styles.row, marginBottom: 10 } },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, 'Buyer'),
          React.createElement(Text, { style: styles.value }, opts.buyerName || 'Buyer'),
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, 'Supplier'),
          React.createElement(Text, { style: styles.value }, opts.tenantName || 'Supplier'),
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.label }, 'Date'),
          React.createElement(Text, { style: styles.value }, opts.createdAt),
        ),
      ),
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(Text, { style: { ...styles.cell } }, 'SKU'),
        React.createElement(Text, { style: { ...styles.cellWide } }, 'Description'),
        React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, 'Qty'),
        React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, `Unit (${opts.currency})`),
        React.createElement(Text, { style: { ...styles.cell, textAlign: 'right' } }, `Line (${opts.currency})`),
      ),
      opts.lines.map((l, idx) =>
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
        React.createElement(Text, { style: styles.label }, `Total (${opts.currency})`),
        React.createElement(Text, { style: { fontSize: 12, fontWeight: 'bold' } }, total.toFixed(2)),
      ),
      opts.terms
        ? React.createElement(
            View,
            { style: styles.footer },
            React.createElement(Text, { style: { fontWeight: 'bold', marginBottom: 4 } }, 'Terms'),
            React.createElement(Text, null, opts.terms),
          )
        : null,
    ),
  )
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const supa = supabaseServer()
    // Load PO
    const { data: poRow, error: poErr } = await supa.from('purchase_orders').select('*').eq('id', id).maybeSingle()
    if (poErr) throw poErr
    if (!poRow) return NextResponse.json({ ok: false, message: 'PO not found' }, { status: 404 })
    const tenantId = poRow.tenant_id as string

    const po: PurchaseOrderRow = {
      id: String(poRow.id),
      tenant_id: String(poRow.tenant_id),
      lot_id: poRow.lot_id ?? null,
      buyer_id: poRow.buyer_id ?? null,
      notes: poRow.notes ?? null,
      created_at: poRow.created_at ?? null,
      po_number: poRow.po_number ?? null,
      pdf_path: poRow.pdf_path ?? null,
    }

    // Tenant settings + name
    const { data: tsRow, error: tsErr } = await supa.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
    if (tsErr) throw tsErr
    const ts = (tsRow as TenantSettings) || {}
    const { data: tenantRow, error: tenantErr } = await supa.from('tenants').select('name').eq('id', tenantId).maybeSingle()
    if (tenantErr) throw tenantErr

    // Buyer info
    let buyerName = 'Buyer'
    if (po.buyer_id) {
      const { data: buyerRow } = await supa.from('buyers').select('name,company').eq('id', po.buyer_id).maybeSingle()
      if (buyerRow) buyerName = (buyerRow.name as string) || (buyerRow.company as string) || buyerName
    }

    // Lines: use lot line_items as fallback
    let lines: Array<{ sku: string; desc: string; qty: number; price: number }> = []
    if (po.lot_id) {
      const { data: liRows } = await supa.from('line_items').select('model,description,qty,asking_price,line_ref').eq('lot_id', po.lot_id).limit(2000)
      lines =
        liRows?.map((r: any) => ({
          sku: r.line_ref || r.model || 'Item',
          desc: r.description || r.model || 'Item',
          qty: Number(r.qty ?? 1) || 1,
          price: Number(r.asking_price ?? 0) || 0,
        })) ?? []
    }
    if (!lines.length) {
      lines = [{ sku: 'ITEM', desc: 'Line item', qty: 1, price: 0 }]
    }

    // Currency
    const currency = (poRow.currency as string) || (ts.default_currency as string) || 'USD'

    // PO number handling
    let poNumber = po.po_number
    if (!poNumber) {
      // Get and bump counter
      const nextNum =
        (ts.po_number_current as number | null) ??
        (ts.po_number_start as number | null) ??
        1000
      poNumber = `PO-${nextNum}`
      const { error: bumpErr } = await supa
        .from('tenant_settings')
        .update({ po_number_current: nextNum + 1, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
      if (bumpErr) console.warn('po counter bump failed', bumpErr)
      await supa.from('purchase_orders').update({ po_number: poNumber }).eq('id', po.id)
    }

    const createdLabel = po.created_at ? new Date(po.created_at).toLocaleDateString() : new Date().toLocaleDateString()
    const doc = buildDoc({
      tenantName: (tenantRow?.name as string) || 'Supplier',
      buyerName,
      poNumber,
      createdAt: createdLabel,
      currency,
      lines,
      brandColor: ts.po_brand_color || '#1E3A5F',
      terms: ts.po_terms || po.notes,
      headerText: ts.po_header || 'Purchase Order',
    })

    const buffer = await pdf(doc).toBuffer()
    const storagePath = `po/${tenantId}/${po.id}.pdf`

    // upload to storage
    const { error: uploadErr } = await supa.storage.from('docs').upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (uploadErr) throw uploadErr

    await supa.from('purchase_orders').update({ pdf_path: storagePath }).eq('id', po.id)

    const { data: signed, error: signErr } = await supa.storage.from('docs').createSignedUrl(storagePath, 60 * 15)
    if (signErr) throw signErr

    return NextResponse.json({ ok: true, url: signed.signedUrl, po_number: poNumber })
  } catch (e: unknown) {
    console.error('po pdf error', e)
    const msg = e instanceof Error ? e.message : 'Failed to generate PO PDF'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
