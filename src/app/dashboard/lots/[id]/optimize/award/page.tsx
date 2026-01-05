'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'
import * as XLSX from 'xlsx'

type Lot = {
  id: string
  title: string | null
  currency: string | null
}

type LineItem = {
  id: string
  lot_id: string
  description: string | null
  qty: number | null

  serial_tag: string | null
  model: string | null
  cpu: string | null
  cpu_qty: number | null
  memory_part_numbers: string | null
  memory_qty: number | null
  network_card: string | null
  expansion_card: string | null
  gpu: string | null
}

type Offer = {
  id: string
  buyer_id: string
}

type Buyer = {
  id: string
  name: string
  company: string | null
  email: string | null
  credit_ok: boolean | null
  reliability_score: number | null
  payment_terms: string | null
  is_active: boolean | null
  do_not_invite: boolean | null
}

type OfferLine = {
  id: string
  offer_id: string
  line_item_id: string
  unit_price: number | null
  currency: string | null
  qty_snapshot: number | null
}

function money(n: number | null | undefined, currency: string) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const rounded = Math.round(n * 100) / 100
  return `${rounded} ${currency}`
}

function buyerLabel(b: Buyer | null | undefined) {
  if (!b) return '(buyer)'
  return b.company ? `${b.company} — ${b.name}` : b.name
}

function safeSheetName(name: string) {
  // Excel sheet name rules: max 31 chars, no []:*?/\
  return name.replace(/[\[\]\:\*\?\/\\]/g, '').slice(0, 31) || 'Sheet'
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}

export default function SplitAwardPackPage() {
  const params = useParams()
  const lotId = params.id as string

  const [tenantId, setTenantId] = useState('')
  const [lot, setLot] = useState<Lot | null>(null)
  const currency = lot?.currency ?? 'USD'

  const [items, setItems] = useState<LineItem[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [buyers, setBuyers] = useState<Record<string, Buyer>>({})
  const [offerLines, setOfferLines] = useState<OfferLine[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // optional filters
  const [hideNoBids, setHideNoBids] = useState(false)

  const load = useCallback(async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      // lot
      const { data: lotData, error: lotErr } = await supabase
        .from('lots')
        .select('id,title,currency')
        .eq('id', lotId)
        .single()
      if (lotErr) throw lotErr
      setLot(lotData as Lot)

      // line_items (cap high; can add paging later)
      const { data: itemData, error: itemErr } = await supabase
        .from('line_items')
        .select(
          'id,lot_id,description,qty,serial_tag,model,cpu,cpu_qty,memory_part_numbers,memory_qty,network_card,expansion_card,gpu'
        )
        .eq('lot_id', lotId)
        .order('id', { ascending: false })
        .limit(5000)
      if (itemErr) throw itemErr
      setItems((itemData as LineItem[]) ?? [])

      // offers (to map offer_id -> buyer_id)
      const { data: offerData, error: offerErr } = await supabase
        .from('offers')
        .select('id,buyer_id')
        .eq('tenant_id', tid)
        .eq('lot_id', lotId)
        .limit(5000)
      if (offerErr) throw offerErr
      const off = (offerData as Offer[]) ?? []
      setOffers(off)

      const offerIds = off.map((o) => o.id)
      if (!offerIds.length) {
        setOfferLines([])
        setBuyers({})
        return
      }

      // offer_lines (priced only)
      const { data: lineData, error: lineErr } = await supabase
        .from('offer_lines')
        .select('id,offer_id,line_item_id,unit_price,currency,qty_snapshot')
        .in('offer_id', offerIds)
        .not('unit_price', 'is', null)
        .limit(200000)

      if (lineErr) throw lineErr
      const lines = (lineData as OfferLine[]) ?? []
      setOfferLines(lines)

      // buyers for these offers
      const buyerIds = Array.from(new Set(off.map((o) => o.buyer_id).filter(Boolean)))
      if (buyerIds.length) {
        const { data: buyerData, error: buyerErr } = await supabase
          .from('buyers')
          .select('id,name,company,email,credit_ok,reliability_score,payment_terms,is_active,do_not_invite')
          .eq('tenant_id', tid)
          .in('id', buyerIds)

        if (buyerErr) throw buyerErr
        const bMap: Record<string, Buyer> = {}
        for (const b of (buyerData as Buyer[]) ?? []) bMap[b.id] = b
        setBuyers(bMap)
      } else {
        setBuyers({})
      }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load award pack'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [lotId])

  useEffect(() => {
    const init = async () => {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)
      await load(profile.tenant_id)
    }
    init()
  }, [lotId, load])

  const offerIdToBuyerId = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of offers) m.set(o.id, o.buyer_id)
    return m
  }, [offers])

  // Best unit price per line item (optimizer logic)
  const bestLineByItem = useMemo(() => {
    // item_id -> { buyer_id, unit_price }
    const best = new Map<
      string,
      { buyer_id: string; offer_id: string; unit_price: number; qty_snapshot: number | null; currency: string | null }
    >()

    for (const l of offerLines) {
      const buyer_id = offerIdToBuyerId.get(l.offer_id)
      if (!buyer_id) continue
      const unit = l.unit_price
      if (unit === null || unit === undefined) continue
      const curBest = best.get(l.line_item_id)
      if (!curBest || unit > curBest.unit_price) {
        best.set(l.line_item_id, {
          buyer_id,
          offer_id: l.offer_id,
          unit_price: unit,
          qty_snapshot: l.qty_snapshot ?? null,
          currency: l.currency ?? null,
        })
      }
    }
    return best
  }, [offerLines, offerIdToBuyerId])

  // Group the "winning" lines per buyer
  const allocation = useMemo(() => {
    type Row = {
      line_item_id: string
      model: string
      description: string
      serial_tag: string
      qty: number
      unit_price: number
      extended: number
      cpu: string
      cpu_qty: number | ''
      memory_part_numbers: string
      memory_qty: number | ''
      network_card: string
      expansion_card: string
      gpu: string
    }

    const byBuyer: Record<string, { buyer: Buyer | null; total: number; rows: Row[] }> = {}

    for (const it of items) {
      const win = bestLineByItem.get(it.id)
      if (!win) continue

      const qty = win.qty_snapshot ?? it.qty ?? 0
      if (hideNoBids && qty === 0) continue

      const b = buyers[win.buyer_id] ?? null
      if (!byBuyer[win.buyer_id]) byBuyer[win.buyer_id] = { buyer: b, total: 0, rows: [] }

      const row: Row = {
        line_item_id: it.id,
        model: it.model ?? '',
        description: it.description ?? '',
        serial_tag: it.serial_tag ?? '',
        qty: qty ?? 0,
        unit_price: win.unit_price,
        extended: win.unit_price * (qty ?? 0),
        cpu: it.cpu ?? '',
        cpu_qty: it.cpu_qty ?? '',
        memory_part_numbers: it.memory_part_numbers ?? '',
        memory_qty: it.memory_qty ?? '',
        network_card: it.network_card ?? '',
        expansion_card: it.expansion_card ?? '',
        gpu: it.gpu ?? '',
      }

      byBuyer[win.buyer_id].rows.push(row)
      byBuyer[win.buyer_id].total += row.extended
    }

    // sort rows per buyer (highest extended first)
    for (const k of Object.keys(byBuyer)) {
      byBuyer[k].rows.sort((a, b) => b.extended - a.extended)
    }

    // buyer ordering (highest total first)
    const ordered = Object.entries(byBuyer)
      .map(([buyer_id, v]) => ({ buyer_id, ...v }))
      .sort((a, b) => b.total - a.total)

    const splitTotal = ordered.reduce((acc, b) => acc + b.total, 0)
    const pricedLines = ordered.reduce((acc, b) => acc + b.rows.length, 0)

    return { ordered, splitTotal, pricedLines }
  }, [items, bestLineByItem, buyers, hideNoBids])

  const downloadWorkbookAllSheets = () => {
    if (!allocation.ordered.length) return alert('No allocation to export yet.')

    const wb = XLSX.utils.book_new()
    const title = lot?.title ?? lotId

    for (const b of allocation.ordered) {
      const label = buyerLabel(b.buyer)
      const sheetName = safeSheetName(label)
      const ws = XLSX.utils.json_to_sheet(b.rows)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    XLSX.writeFile(wb, `split-award-pack-${title}.xlsx`)
  }

  const downloadBuyerCSV = (buyer_id: string) => {
    const buyerBlock = allocation.ordered.find((x) => x.buyer_id === buyer_id)
    if (!buyerBlock) return
    const label = buyerLabel(buyerBlock.buyer)
    const csv = toCsv(buyerBlock.rows)
    downloadTextFile(`award-${label}.csv`, csv, 'text/csv')
  }

  const downloadBuyerXLSX = (buyer_id: string) => {
    const buyerBlock = allocation.ordered.find((x) => x.buyer_id === buyer_id)
    if (!buyerBlock) return
    const label = buyerLabel(buyerBlock.buyer)

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(buyerBlock.rows)
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(label))
    XLSX.writeFile(wb, `award-${label}.xlsx`)
  }

  const buildMessage = (buyer_id: string) => {
    const buyerBlock = allocation.ordered.find((x) => x.buyer_id === buyer_id)
    if (!buyerBlock) return ''
    const b = buyerBlock.buyer
    const title = lot?.title ?? `Lot ${lotId}`

    // Keep it short and broker-friendly
    return [
      `Hi ${b?.name ?? 'there'},`,
      ``,
      `Based on your line-by-line pricing for ${title}, we can award you the following lines:`,
      `- Lines: ${buyerBlock.rows.length}`,
      `- Total: ${money(buyerBlock.total, currency)}`,
      ``,
      `Attached is the award sheet (CSV/XLSX).`,
      `Please confirm:`,
      `1) Payment terms`,
      `2) Collection / shipping`,
      `3) Validity window for these prices`,
      ``,
      `Thanks,`,
      `—`,
    ].join('\n')
  }

  const copyMessage = async (buyer_id: string) => {
    const msg = buildMessage(buyer_id)
    try {
      await navigator.clipboard.writeText(msg)
      alert('Copied message to clipboard.')
    } catch (e) {
      console.error(e)
      alert('Failed to copy. Your browser may block clipboard access.')
    }
  }

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>
  if (error) return <main style={{ padding: 24, color: 'crimson' }}>{error}</main>

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Split award pack</h1>
          <div style={{ color: '#666' }}>
            {lot?.title ?? 'Lot'} • Currency: <b>{currency}</b>
          </div>
          <div style={{ color: '#666', marginTop: 6 }}>
            Split total: <b>{money(allocation.splitTotal, currency)}</b> • Lines awarded: <b>{allocation.pricedLines}</b> • Buyers:{' '}
            <b>{allocation.ordered.length}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={`/dashboard/lots/${lotId}/optimize`}>← Back to optimizer</Link>
          <Link href={`/dashboard/lots/${lotId}/offers`}>Offers →</Link>
          <button onClick={() => tenantId && load(tenantId)} style={{ padding: 10 }}>
            Refresh
          </button>
        </div>
      </div>

      <hr style={{ margin: '18px 0' }} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#666' }}>
          <input type="checkbox" checked={hideNoBids} onChange={(e) => setHideNoBids(e.target.checked)} />
          Hide lines with qty 0
        </label>

        <button
          onClick={downloadWorkbookAllSheets}
          disabled={!allocation.ordered.length}
          style={{ padding: 10, borderRadius: 10, marginLeft: 'auto' }}
        >
          Download XLSX (one sheet per buyer)
        </button>
      </div>

      <hr style={{ margin: '18px 0' }} />

      {allocation.ordered.length === 0 ? (
        <div style={{ color: '#666' }}>No line-by-line prices found yet. Ask buyers to price a few key lines.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {allocation.ordered.map((b) => {
            const gated = !!b.buyer && (b.buyer.is_active === false || b.buyer.do_not_invite === true)

            return (
              <div key={b.buyer_id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 360 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      {buyerLabel(b.buyer)}
                      {gated ? <span style={{ marginLeft: 8, color: 'crimson', fontWeight: 700 }}>• gated</span> : null}
                    </div>

                    <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', color: '#666', fontSize: 12 }}>
                      <span>Lines: <b>{b.rows.length}</b></span>
                      <span>Total: <b>{money(b.total, currency)}</b></span>
                      <span>Credit: <b>{b.buyer?.credit_ok ? 'OK' : 'Flag'}</b></span>
                      <span>Reliability: <b>{b.buyer?.reliability_score ?? '—'}</b></span>
                      <span>Terms: <b>{b.buyer?.payment_terms ?? '—'}</b></span>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => downloadBuyerXLSX(b.buyer_id)} style={{ padding: 10 }}>
                        Download XLSX
                      </button>
                      <button onClick={() => downloadBuyerCSV(b.buyer_id)} style={{ padding: 10 }}>
                        Download CSV
                      </button>
                      <button onClick={() => copyMessage(b.buyer_id)} style={{ padding: 10 }}>
                        Copy message
                      </button>
                    </div>
                  </div>

                  <div style={{ minWidth: 520, flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Top lines (preview)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {b.rows.slice(0, 6).map((r) => (
                        <div key={r.line_item_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.model || r.description || r.line_item_id}
                          </div>
                          <div style={{ color: '#666' }}>
                            Unit: <b>{money(r.unit_price, currency)}</b> • Qty: <b>{r.qty}</b> • Ext:{' '}
                            <b>{money(r.extended, currency)}</b>
                          </div>
                        </div>
                      ))}
                      {b.rows.length > 6 ? <div style={{ color: '#666', fontSize: 12 }}>…and {b.rows.length - 6} more</div> : null}
                    </div>
                  </div>
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer' }}>Preview message</summary>
                  <pre style={{ marginTop: 10, padding: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 10, whiteSpace: 'pre-wrap' }}>
                    {buildMessage(b.buyer_id)}
                  </pre>
                </details>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
