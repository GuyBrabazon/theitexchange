'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Lot = {
  id: string
  title: string | null
  currency: string | null
  status: string | null
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
  take_all_total: number | null
  created_at: string
  status: string | null
  buyers?: Buyer | null
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

type OfferLineJoined = {
  id: string
  offer_id: string
  line_item_id: string
  unit_price: number | null
  currency: string | null
  qty_snapshot: number | null
  offers?: { id: string; buyer_id: string } | null
  buyers?: Buyer | null
}

function money(n: number | null | undefined, currency: string) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Math.round(n * 100) / 100} ${currency}`
}

function buyerLabel(b: Buyer | null | undefined) {
  if (!b) return '(buyer)'
  return b.company ? `${b.company} — ${b.name}` : b.name
}

export default function LotOptimizePage() {
  const params = useParams()
  const lotId = params.id as string

  const [tenantId, setTenantId] = useState('')
  const [lot, setLot] = useState<Lot | null>(null)
  const currency = lot?.currency ?? 'USD'

  const [items, setItems] = useState<LineItem[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [offerLines, setOfferLines] = useState<OfferLineJoined[]>([])
  const [loading, setLoading] = useState(true)

  // UI
  const [q, setQ] = useState('')
  const [showTop3, setShowTop3] = useState(false)
  const [hideZeroQty, setHideZeroQty] = useState(true)
  const [hideNoBids, setHideNoBids] = useState(false)

  const load = useCallback(async (tid: string) => {
    setLoading(true)
    try {
      // Lot
      const { data: lotData, error: lotErr } = await supabase
        .from('lots')
        .select('id,title,currency,status')
        .eq('id', lotId)
        .single()
      if (lotErr) throw lotErr
      setLot(lotData as Lot)

      // Items (cap for now; can add pagination later)
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

      // Offers (take-all)
      const { data: offerData, error: offerErr } = await supabase
        .from('offers')
        .select(
          `
          id,buyer_id,take_all_total,created_at,status,
          buyers ( id,name,company,email,credit_ok,reliability_score,payment_terms,is_active,do_not_invite )
        `
        )
        .eq('tenant_id', tid)
        .eq('lot_id', lotId)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (offerErr) throw offerErr
      const offerRows =
        (Array.isArray(offerData) ? offerData : []).map((row) => {
          const buyerRaw = (row as any)?.buyers
          const buyerObj = Array.isArray(buyerRaw) ? buyerRaw[0] : buyerRaw
          return {
            id: String((row as any)?.id ?? ''),
            buyer_id: String((row as any)?.buyer_id ?? ''),
            take_all_total: (row as any)?.take_all_total ?? null,
            created_at: (row as any)?.created_at ?? null,
            status: (row as any)?.status ?? null,
            buyers: buyerObj
              ? {
                  id: String(buyerObj.id ?? ''),
                  name: String(buyerObj.name ?? ''),
                  company: buyerObj.company ?? null,
                  email: buyerObj.email ?? null,
                  credit_ok: buyerObj.credit_ok ?? null,
                  reliability_score: buyerObj.reliability_score ?? null,
                  payment_terms: buyerObj.payment_terms ?? null,
                  is_active: buyerObj.is_active ?? null,
                  do_not_invite: buyerObj.do_not_invite ?? null,
                }
              : null,
          } as Offer
        }) ?? []
      setOffers(offerRows)

      // Offer lines joined to buyer (priced only)
      const offerIds = offerRows.map((o) => o.id)
      if (!offerIds.length) {
        setOfferLines([])
        return
      }

      const { data: lineData, error: lineErr } = await supabase
        .from('offer_lines')
        .select(
          `
          id,offer_id,line_item_id,unit_price,currency,qty_snapshot,
          offers ( id,buyer_id ),
          buyers:offers!inner(
            buyers ( id,name,company,email,credit_ok,reliability_score,payment_terms,is_active,do_not_invite )
          )
        `
        )
        // PostgREST trick above may not work depending on your foreign keys.
        // If this errors, see note below ("If your join errors").
        .in('offer_id', offerIds)
        .not('unit_price', 'is', null)
        .limit(200000)

      if (lineErr) throw lineErr

      // Normalize buyers join shape (supabase can nest weirdly depending on aliasing)
      const normalized: OfferLineJoined[] = (Array.isArray(lineData) ? lineData : []).map((r) => {
        const offersRaw = (r as any)?.offers
        const offerObj = Array.isArray(offersRaw) ? offersRaw[0] : offersRaw

        // r.buyers might be [{ buyers: {...} }] depending on alias nesting
        const buyersRaw = (r as any)?.buyers
        const buyerFromNested = Array.isArray(buyersRaw) ? buyersRaw[0]?.buyers ?? buyersRaw[0] : buyersRaw?.buyers ?? buyersRaw
        const buyer: Buyer | null = buyerFromNested
          ? {
              id: String(buyerFromNested.id ?? ''),
              name: String(buyerFromNested.name ?? ''),
              company: buyerFromNested.company ?? null,
              email: buyerFromNested.email ?? null,
              credit_ok: buyerFromNested.credit_ok ?? null,
              reliability_score: buyerFromNested.reliability_score ?? null,
              payment_terms: buyerFromNested.payment_terms ?? null,
              is_active: buyerFromNested.is_active ?? null,
              do_not_invite: buyerFromNested.do_not_invite ?? null,
            }
          : null

        return {
          id: String((r as any)?.id ?? ''),
          offer_id: String((r as any)?.offer_id ?? ''),
          line_item_id: String((r as any)?.line_item_id ?? ''),
          unit_price: (r as any)?.unit_price ?? null,
          currency: (r as any)?.currency ?? null,
          qty_snapshot: (r as any)?.qty_snapshot ?? null,
          offers: offerObj
            ? {
                id: String(offerObj.id ?? ''),
                buyer_id: String(offerObj.buyer_id ?? ''),
              }
            : null,
          buyers: buyer,
        }
      })

      setOfferLines(normalized)
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
    init().catch((e) => {
      console.error(e)
      alert(e?.message ?? 'Failed to load optimizer')
    })
  }, [load])

  // --- Build lookups ---
  const linesByItem = useMemo(() => {
    const m = new Map<string, OfferLineJoined[]>()
    for (const l of offerLines) {
      if (!m.has(l.line_item_id)) m.set(l.line_item_id, [])
      m.get(l.line_item_id)!.push(l)
    }
    // sort each item’s offers desc by unit_price
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => (b.unit_price ?? -1) - (a.unit_price ?? -1))
      m.set(k, arr)
    }
    return m
  }, [offerLines])

  const filteredItems = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)

    return items.filter((it) => {
      if (hideZeroQty && (it.qty ?? 0) <= 0) return false

      const hasBids = (linesByItem.get(it.id)?.length ?? 0) > 0
      if (hideNoBids && !hasBids) return false

      if (!s) return true
      return (
        hit(it.model) ||
        hit(it.description) ||
        hit(it.serial_tag) ||
        hit(it.cpu) ||
        hit(it.memory_part_numbers) ||
        hit(it.network_card) ||
        hit(it.expansion_card) ||
        hit(it.gpu)
      )
    })
  }, [items, q, hideZeroQty, hideNoBids, linesByItem])

  // For each line item, choose best unit price (highest)
  const bestByItem = useMemo(() => {
    type Best = {
      item: LineItem
      best: OfferLineJoined | null
      top3: OfferLineJoined[]
      qty: number
      extendedBest: number | null
    }

    const out: Best[] = []
    for (const it of filteredItems) {
      const qty = it.qty ?? 0
      const rows = linesByItem.get(it.id) ?? []
      const best = rows.length ? rows[0] : null
      const extendedBest = best?.unit_price != null ? best.unit_price * qty : null
      out.push({
        item: it,
        best,
        top3: rows.slice(0, 3),
        qty,
        extendedBest,
      })
    }
    return out
  }, [filteredItems, linesByItem])

  // Total split value + allocation by buyer
  const splitSummary = useMemo(() => {
    let total = 0
    let pricedLines = 0
    let totalLines = 0

    const byBuyer = new Map<string, { buyer: Buyer | null; lines: number; value: number }>()
    for (const row of bestByItem) {
      totalLines++
      if (!row.best || row.extendedBest == null) continue
      pricedLines++
      total += row.extendedBest

      const bid = row.best.offers?.buyer_id ?? 'unknown'
      if (!byBuyer.has(bid)) byBuyer.set(bid, { buyer: row.best.buyers ?? null, lines: 0, value: 0 })
      const b = byBuyer.get(bid)!
      b.lines += 1
      b.value += row.extendedBest
    }

    const buyers = Array.from(byBuyer.entries())
      .map(([buyer_id, v]) => ({ buyer_id, ...v }))
      .sort((a, b) => b.value - a.value)

    return { total, pricedLines, totalLines, buyers }
  }, [bestByItem])

  const bestTakeAll = useMemo(() => {
    const valid = offers
      .filter((o) => o.take_all_total != null)
      .slice()
      .sort((a, b) => (b.take_all_total ?? -1) - (a.take_all_total ?? -1))
    return valid[0] ?? null
  }, [offers])

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Optimizer</h1>
          <div style={{ color: '#666' }}>
            {lot?.title ?? 'Lot'} • Currency: <b>{currency}</b>
          </div>
          <div style={{ color: '#666', marginTop: 6 }}>
            Split value (best-by-line): <b>{money(splitSummary.total, currency)}</b> • Coverage:{' '}
            <b>
              {splitSummary.pricedLines}/{splitSummary.totalLines}
            </b>{' '}
            lines priced
          </div>
          <div style={{ color: '#666', marginTop: 4 }}>
            Best take-all:{' '}
            <b>
              {bestTakeAll ? money(bestTakeAll.take_all_total, currency) : '—'}
            </b>{' '}
            {bestTakeAll?.buyers ? `(${buyerLabel(bestTakeAll.buyers)})` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={`/dashboard/lots/${lotId}`}>← Summary</Link>
          <Link href={`/dashboard/lots/${lotId}/offers`}>Offers →</Link>
          <Link href={`/dashboard/lots/${lotId}/items`}>Items →</Link>
          <Link href={`/dashboard/lots/${lotId}/invite`}>Invite →</Link>
          <Link href={`/dashboard/lots/${lotId}/optimize/award`}>Split award pack →</Link>
        </div>
      </div>

      <hr style={{ margin: '18px 0' }} />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items (model, serial, CPU, memory PN...)"
          style={{ width: 420, padding: 10, border: '1px solid #ddd', borderRadius: 10 }}
        />

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#666' }}>
          <input type="checkbox" checked={hideZeroQty} onChange={(e) => setHideZeroQty(e.target.checked)} />
          Hide qty 0
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#666' }}>
          <input type="checkbox" checked={hideNoBids} onChange={(e) => setHideNoBids(e.target.checked)} />
          Hide no bids
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#666' }}>
          <input type="checkbox" checked={showTop3} onChange={(e) => setShowTop3(e.target.checked)} />
          Show top 3 per line
        </label>

        <button onClick={() => tenantId && load(tenantId)} style={{ padding: 10, marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>

      <hr style={{ margin: '18px 0' }} />

      <h2>Allocation summary</h2>
      {splitSummary.buyers.length === 0 ? (
        <div style={{ color: '#666', marginTop: 8 }}>No priced lines yet.</div>
      ) : (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {splitSummary.buyers.map((b) => (
            <div key={b.buyer_id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900 }}>{buyerLabel(b.buyer)}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap', color: '#666', fontSize: 12 }}>
                <span>Lines won: <b>{b.lines}</b></span>
                <span>Value: <b>{money(b.value, currency)}</b></span>
                <span>Credit: <b>{b.buyer?.credit_ok ? 'OK' : 'Flag'}</b></span>
                <span>Reliability: <b>{b.buyer?.reliability_score ?? '—'}</b></span>
                <span>Terms: <b>{b.buyer?.payment_terms ?? '—'}</b></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr style={{ margin: '18px 0' }} />

      <h2>Best-by-line</h2>
      <div style={{ color: '#666', marginTop: 6 }}>
        This is a *recommendation view*. It does not award automatically (yet).
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bestByItem.map((row) => {
          const it = row.item
          const best = row.best
          const qty = row.qty
          const bestBuyer = best?.buyers ?? null
          const bestExtended = row.extendedBest

          const label = it.model ?? it.description ?? it.id

          return (
            <div key={it.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 420 }}>
                  <div style={{ fontWeight: 900 }}>{label}</div>
                  {it.description && it.model && it.description !== it.model ? (
                    <div style={{ color: '#666', marginTop: 2 }}>{it.description}</div>
                  ) : null}

                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', color: '#666', fontSize: 12 }}>
                    <span>Qty: <b>{qty}</b></span>
                    {it.serial_tag ? <span>Serial: <b>{it.serial_tag}</b></span> : null}
                    {it.cpu ? <span>CPU: <b>{it.cpu}{it.cpu_qty ? ` (${it.cpu_qty})` : ''}</b></span> : null}
                    {it.memory_part_numbers ? <span>Mem PN: <b>{it.memory_part_numbers}</b></span> : null}
                    {it.memory_qty ? <span>DIMMs: <b>{it.memory_qty}</b></span> : null}
                    {it.network_card ? <span>NIC: <b>{it.network_card}</b></span> : null}
                    {it.expansion_card ? <span>Expansion: <b>{it.expansion_card}</b></span> : null}
                    {it.gpu ? <span>GPU: <b>{it.gpu}</b></span> : null}
                  </div>
                </div>

                <div style={{ minWidth: 420 }}>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#666' }}>Best unit</div>
                      <div style={{ fontWeight: 900 }}>{money(best?.unit_price ?? null, currency)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#666' }}>Best extended</div>
                      <div style={{ fontWeight: 900 }}>{money(bestExtended ?? null, currency)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#666' }}>Best buyer</div>
                      <div style={{ fontWeight: 900 }}>{best ? buyerLabel(bestBuyer) : '—'}</div>
                    </div>
                  </div>

                  {showTop3 ? (
                    <div style={{ marginTop: 10, borderTop: '1px dashed #eee', paddingTop: 10 }}>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Top offers</div>
                      {(row.top3.length ? row.top3 : []).map((l, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {buyerLabel(l.buyers)}
                          </div>
                          <div style={{ color: '#666' }}>
                            Unit: <b>{money(l.unit_price ?? null, currency)}</b>
                          </div>
                        </div>
                      ))}
                      {row.top3.length === 0 ? <div style={{ color: '#666' }}>No bids</div> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}

        {bestByItem.length === 0 ? <div style={{ color: '#666' }}>No items match your filter.</div> : null}
      </div>

      <hr style={{ margin: '18px 0' }} />
      <div style={{ color: '#666', fontSize: 12 }}>
        Tip: This page is intentionally read-only in Phase 1. Next upgrade is “Build split award pack” (exports per buyer).
      </div>
    </main>
  )
}
