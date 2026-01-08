'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Buyer = {
  id: string
  name: string
  company: string | null
  email: string | null
  credit_ok: boolean | null
  reliability_score: number | null
  payment_terms: string | null
}

type OfferRow = {
  id: string
  tenant_id: string
  lot_id: string
  buyer_id: string
  currency: string | null
  take_all_total: number | null
  notes: string | null
  status: string | null
  created_at: string | null
  buyers?: Buyer | null
}

type OfferLine = {
  id: string
  offer_id: string
  line_item_id: string
  unit_price: number | null
  currency: string | null
  qty_snapshot: number | null
}

type LineItem = {
  id: string
  lot_id: string
  description: string | null
  model: string | null
  qty: number | null
  asking_price: number | null
}

type LotRound = {
  id: string
  lot_id: string
  round_number: number
  scope: 'all' | 'unsold' | 'custom'
  status: 'draft' | 'live' | 'closed'
  created_at: string
  closed_at: string | null
}

type AwardedLine = {
  id: string
  tenant_id: string
  lot_id: string
  round_id: string | null
  line_item_id: string
  buyer_id: string
  offer_id: string
  currency: string | null
  unit_price: number | null
  qty: number | null
  extended: number | null
  created_at: string
  buyers?: Buyer | null
  line_items?: LineItem | null
}

function money(n: number | null | undefined, currency: string) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const rounded = Math.round(Number(n) * 100) / 100
  return `${rounded} ${currency}`
}

function buyerLabel(b: Buyer | null | undefined) {
  if (!b) return '(buyer)'
  return b.company ? `${b.company} — ${b.name}` : b.name
}

function scopeLabel(s: LotRound['scope']) {
  if (s === 'unsold') return 'Leftovers only'
  if (s === 'custom') return 'Custom'
  return 'All items'
}

export default function LotOffersPage() {
  const params = useParams()
  const lotId = params.id as string

  const [tenantId, setTenantId] = useState<string>('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')

  const [tab, setTab] = useState<'list' | 'detail' | 'optimizer'>('list')
  const [selectedOfferId, setSelectedOfferId] = useState<string>('')

  const [offers, setOffers] = useState<OfferRow[]>([])
  const [offerLines, setOfferLines] = useState<OfferLine[]>([])
  const [items, setItems] = useState<LineItem[]>([])

  const [rounds, setRounds] = useState<LotRound[]>([])
  const [currentRoundId, setCurrentRoundId] = useState<string>('')
  const currentRound = useMemo(() => rounds.find((r) => r.id === currentRoundId) ?? null, [rounds, currentRoundId])

  const [awarded, setAwarded] = useState<AwardedLine[]>([])

  const [busy, setBusy] = useState(false)

  const currency = useMemo(() => {
    const c = offers.find((o) => o.currency)?.currency
    return c ?? 'USD'
  }, [offers])

  const qtyByLineId = useMemo(() => new Map(items.map((it) => [it.id, it.qty ?? 0])), [items])
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items])

  const selectedOffer = useMemo(() => offers.find((o) => o.id === selectedOfferId) ?? null, [offers, selectedOfferId])
  const selectedOfferLines = useMemo(() => offerLines.filter((l) => l.offer_id === selectedOfferId), [offerLines, selectedOfferId])

  const awardedForCurrentRound = useMemo(() => {
    if (!currentRoundId) return awarded
    return awarded.filter((a) => a.round_id === currentRoundId)
  }, [awarded, currentRoundId])

  const alreadyAwardedLineIds = useMemo(() => {
    // "already awarded" means awarded in ANY round for this lot
    return new Set(awarded.map((a) => a.line_item_id))
  }, [awarded])

  const loadRounds = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('lot_rounds')
      .select('id,lot_id,round_number,scope,status,created_at,closed_at')
      .eq('lot_id', lotId)
      .order('round_number', { ascending: false })

    if (error) throw error
    let rows = (data as LotRound[]) ?? []

    // If no rounds exist, create Round 1 (live, scope=all)
    if (rows.length === 0) {
      // Use upsert so repeated calls don't explode if another tab created it
      const { data: created, error: insErr } = await supabase
        .from('lot_rounds')
        .upsert(
          {
            tenant_id: tid,
            lot_id: lotId,
            round_number: 1,
            scope: 'all',
            status: 'live',
          },
          { onConflict: 'lot_id,round_number' }
        )
        .select('id,lot_id,round_number,scope,status,created_at,closed_at')
        .single()

      if (insErr) throw insErr
      rows = created ? [created as LotRound] : []
    }

    setRounds(rows)

    // Prefer LIVE round, else latest
    const live = rows.find((r) => r.status === 'live')
    const picked = (live ?? rows[0] ?? null)?.id ?? ''
    setCurrentRoundId(picked)
    return { rows, pickedId: picked }
  }, [lotId])

  const loadAll = useCallback(async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      await loadRounds(tid)

      const { data: itemData, error: itemErr } = await supabase
        .from('line_items')
        .select('id,lot_id,description,model,qty,asking_price')
        .eq('lot_id', lotId)
        .order('id', { ascending: false })
        .limit(5000)
      if (itemErr) throw itemErr
      setItems((itemData as LineItem[]) ?? [])

      const { data: offerData, error: offerErr } = await supabase
        .from('offers')
        .select(
          `
          id,tenant_id,lot_id,buyer_id,currency,take_all_total,notes,status,created_at,
          buyers ( id,name,company,email,credit_ok,reliability_score,payment_terms )
        `
        )
        .eq('tenant_id', tid)
        .eq('lot_id', lotId)
        .order('id', { ascending: false })
      if (offerErr) throw offerErr
      const offRows =
        (Array.isArray(offerData) ? offerData : []).map((row) => {
          const buyerRaw = (row as any)?.buyers
          const buyerObj = Array.isArray(buyerRaw) ? buyerRaw[0] : buyerRaw
          return {
            id: String((row as any)?.id ?? ''),
            tenant_id: String((row as any)?.tenant_id ?? ''),
            lot_id: String((row as any)?.lot_id ?? ''),
            buyer_id: String((row as any)?.buyer_id ?? ''),
            currency: (row as any)?.currency ?? null,
            take_all_total: (row as any)?.take_all_total ?? null,
            notes: (row as any)?.notes ?? null,
            status: (row as any)?.status ?? null,
            created_at: (row as any)?.created_at ?? null,
            buyers: buyerObj
              ? {
                  id: String(buyerObj.id ?? ''),
                  name: String(buyerObj.name ?? ''),
                  company: buyerObj.company ?? null,
                  email: buyerObj.email ?? null,
                  credit_ok: buyerObj.credit_ok ?? null,
                  reliability_score: buyerObj.reliability_score ?? null,
                  payment_terms: buyerObj.payment_terms ?? null,
                }
              : null,
          } as OfferRow
        }) ?? []
      setOffers(offRows)

      const offerIds = offRows.map((o) => o.id)
      if (offerIds.length) {
        const { data: lineData, error: lineErr } = await supabase
          .from('offer_lines')
          .select('id,offer_id,line_item_id,unit_price,currency,qty_snapshot')
          .in('offer_id', offerIds)
        if (lineErr) throw lineErr
        setOfferLines((lineData as OfferLine[]) ?? [])
      } else {
        setOfferLines([])
      }

      const { data: awData, error: awErr } = await supabase
        .from('awarded_lines')
        .select(
          `
          id,tenant_id,lot_id,round_id,line_item_id,buyer_id,offer_id,currency,unit_price,qty,extended,created_at,
          buyers ( id,name,company,email,credit_ok,reliability_score,payment_terms ),
          line_items ( id,lot_id,description,model,qty,asking_price )
        `
        )
        .eq('tenant_id', tid)
        .eq('lot_id', lotId)
        .order('id', { ascending: false })
      if (awErr) throw awErr
      const normalizedAwards =
        (Array.isArray(awData) ? awData : []).map((row) => {
          const buyerRaw = (row as any)?.buyers
          const buyerObj = Array.isArray(buyerRaw) ? buyerRaw[0] : buyerRaw
          const liRaw = (row as any)?.line_items
          const liObj = Array.isArray(liRaw) ? liRaw[0] : liRaw
          return {
            id: String((row as any)?.id ?? ''),
            tenant_id: String((row as any)?.tenant_id ?? ''),
            lot_id: String((row as any)?.lot_id ?? ''),
            round_id: (row as any)?.round_id ?? null,
            line_item_id: String((row as any)?.line_item_id ?? ''),
            buyer_id: String((row as any)?.buyer_id ?? ''),
            offer_id: String((row as any)?.offer_id ?? ''),
            currency: (row as any)?.currency ?? null,
            unit_price: (row as any)?.unit_price ?? null,
            qty: (row as any)?.qty ?? null,
            extended: (row as any)?.extended ?? null,
            created_at: (row as any)?.created_at ?? null,
            buyers: buyerObj
              ? {
                  id: String(buyerObj.id ?? ''),
                  name: String(buyerObj.name ?? ''),
                  company: buyerObj.company ?? null,
                  email: buyerObj.email ?? null,
                  credit_ok: buyerObj.credit_ok ?? null,
                  reliability_score: buyerObj.reliability_score ?? null,
                  payment_terms: buyerObj.payment_terms ?? null,
                }
              : null,
            line_items: liObj
              ? {
                  id: String(liObj.id ?? ''),
                  lot_id: String(liObj.lot_id ?? ''),
                  description: liObj.description ?? null,
                  model: liObj.model ?? null,
                  qty: liObj.qty ?? null,
                  asking_price: liObj.asking_price ?? null,
                }
              : null,
          } as AwardedLine
        }) ?? []
      setAwarded(normalizedAwards)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load offers'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [loadRounds, lotId])

  useEffect(() => {
    const init = async () => {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)
      await loadAll(profile.tenant_id)
    }
    init()
  }, [loadAll])

  // compute totals per offer from offer_lines (unit_price * qty)
  const offerComputed = useMemo(() => {
    const linesByOffer = new Map<string, OfferLine[]>()
    for (const l of offerLines) {
      const arr = linesByOffer.get(l.offer_id) ?? []
      arr.push(l)
      linesByOffer.set(l.offer_id, arr)
    }

    return offers.map((o) => {
      const ls = linesByOffer.get(o.id) ?? []
      let lineTotal = 0
      let lineCount = 0
      for (const l of ls) {
        const unit = l.unit_price
        if (unit === null || unit === undefined) continue
        lineCount += 1
        const qty = qtyByLineId.get(l.line_item_id) ?? l.qty_snapshot ?? 0
        lineTotal += Number(unit) * Number(qty)
      }
      return { offer: o, lineTotal, lineCount }
    })
  }, [offers, offerLines, qtyByLineId])

  // OPTIMIZER: best (highest unit) per line
  const optimizerWinners = useMemo(() => {
    const best = new Map<string, { offer: OfferRow; line: OfferLine; unit: number; qty: number; extended: number }>()
    const offerById = new Map(offers.map((o) => [o.id, o] as const))

    for (const l of offerLines) {
      const unit = l.unit_price
      if (unit === null || unit === undefined) continue
      const unitNum = Number(unit)
      if (!Number.isFinite(unitNum)) continue

      const offer = offerById.get(l.offer_id)
      if (!offer) continue

      const qty = qtyByLineId.get(l.line_item_id) ?? l.qty_snapshot ?? 0
      const ext = unitNum * Number(qty)

      const current = best.get(l.line_item_id)
      if (!current || unitNum > current.unit) {
        best.set(l.line_item_id, { offer, line: l, unit: unitNum, qty: Number(qty), extended: ext })
      }
    }

    const rows = Array.from(best.entries()).map(([line_item_id, v]) => {
      const it = itemById.get(line_item_id) ?? null
      return { line_item_id, item: it, ...v }
    })

    rows.sort((a, b) => (b.extended ?? 0) - (a.extended ?? 0))
    return rows
  }, [offerLines, offers, qtyByLineId, itemById])

  const optimizerTotalsByBuyer = useMemo(() => {
    const map = new Map<string, { buyer: Buyer | null; total: number; lines: number }>()
    for (const r of optimizerWinners) {
      const b = r.offer.buyers ?? null
      const buyerId = r.offer.buyer_id
      const cur = map.get(buyerId) ?? { buyer: b, total: 0, lines: 0 }
      cur.total += r.extended ?? 0
      cur.lines += 1
      map.set(buyerId, cur)
    }
    return Array.from(map.entries())
      .map(([buyer_id, v]) => ({ buyer_id, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [optimizerWinners])

  const optimizerGrandTotal = useMemo(() => optimizerWinners.reduce((s, r) => s + (r.extended ?? 0), 0), [optimizerWinners])

  const awardOptimizerLines = async () => {
    if (!tenantId) return
    if (!currentRoundId) {
      alert('No round found for this lot. Create or start a round first.')
      return
    }
    if (optimizerWinners.length === 0) {
      alert('No line-by-line offers found to optimize.')
      return
    }

    const ok = confirm(
      `Award ${optimizerWinners.length} lines in Round ${currentRound?.round_number ?? ''} to the highest unit-price bidders?`
    )
    if (!ok) return

    setBusy(true)
    try {
      const rows = optimizerWinners.map((r) => ({
        tenant_id: tenantId,
        lot_id: lotId,
        round_id: currentRoundId,
        line_item_id: r.line_item_id,
        buyer_id: r.offer.buyer_id,
        offer_id: r.offer.id,
        currency: r.offer.currency ?? currency,
        unit_price: r.unit,
        qty: r.qty,
        extended: r.extended,
      }))

      // Requires unique(round_id, line_item_id)
      const { error } = await supabase.from('awarded_lines').upsert(rows, { onConflict: 'round_id,line_item_id' })
      if (error) throw error

      // Mark lot as awarded
      await supabase.from('lots').update({ status: 'awarded' }).eq('id', lotId)

      alert('Awarded lines saved for this round.')
      await loadAll(tenantId)
      setTab('optimizer')
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to award lines'
      alert(msg)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Accept a TAKE-ALL offer operationally:
   * 1) Mark selected offer accepted
   * 2) (Optional) reject all other offers
   * 3) Create awarded_lines rows (so invite page + PO gating works)
   *
   * Awards in CURRENT ROUND:
   * - scope=all: award all items (excluding already awarded in other rounds to avoid duplicates)
   * - scope=unsold: award only items not already awarded in any round
   */
  const acceptTakeAllOffer = async (o: OfferRow) => {
    if (!tenantId) return
    if (!currentRoundId) {
      alert('No round found for this lot. Please refresh or create a round first.')
      return
    }

    const ok = confirm(
      `Accept TAKE-ALL offer from "${buyerLabel(o.buyers)}" and award items into Round ${currentRound?.round_number ?? ''}?`
    )
    if (!ok) return

    setBusy(true)
    try {
      // 1) Accept this offer
      {
        const { error } = await supabase
          .from('offers')
          .update({ status: 'accepted' })
          .eq('id', o.id)
          .eq('tenant_id', tenantId)
        if (error) throw error
      }

      // 2) Auto-reject all others (prevents confusion)
      {
        const otherIds = offers.filter((x) => x.id !== o.id).map((x) => x.id)
        if (otherIds.length) {
          // Only reject ones that are not already accepted/rejected if you want, but simplest:
          const { error } = await supabase
            .from('offers')
            .update({ status: 'rejected' })
            .in('id', otherIds)
            .eq('tenant_id', tenantId)
          if (error) throw error
        }
      }

      // 3) Determine which line items to award in this round
      const scope = currentRound?.scope ?? 'all'
      let eligible = items

      // In practice, both scopes should avoid duplicating awards for already-awarded items.
      // (Your DB unique is per-round, but operationally you don't want to "sell" the same line twice.)
      eligible = eligible.filter((it) => !alreadyAwardedLineIds.has(it.id))

      // For unsold scope, the above filter already does it.
      // For all scope, also filtered (to avoid duplicates).
      if (scope === 'custom') {
        alert('Custom scope is not implemented yet. Using leftovers (unawarded) items as a safe default.')
      }

      if (eligible.length === 0) {
        alert('No eligible (unawarded) items remain to award in this round.')
        await loadAll(tenantId)
        return
      }

      // Create awarded_lines rows (take-all has no per-line unit; store qty snapshot)
      const rows = eligible.map((it) => ({
        tenant_id: tenantId,
        lot_id: lotId,
        round_id: currentRoundId,

        line_item_id: it.id,
        buyer_id: o.buyer_id,
        offer_id: o.id,
        currency: o.currency ?? currency,

        unit_price: null,
        qty: it.qty ?? 0,
        extended: null,
      }))

      const { error: awErr } = await supabase.from('awarded_lines').upsert(rows, { onConflict: 'round_id,line_item_id' })
      if (awErr) throw awErr

      alert(`Accepted offer + awarded ${rows.length} items. Buyer invite link should now show winner status + PO upload.`)
      // Mark lot as awarded
      await supabase.from('lots').update({ status: 'awarded' }).eq('id', lotId)
      await loadAll(tenantId)
      setTab('list')
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to accept take-all offer'
      alert(msg)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>
  if (error) return <main style={{ padding: 24, color: 'crimson' }}>{error}</main>

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Offers</h1>
          <div style={{ color: '#666' }}>
            Lot: <b>{lotId}</b> • Currency: <b>{currency}</b>
          </div>
          <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>
            Round:{' '}
            <b>
              {currentRound ? `R${currentRound.round_number} (${scopeLabel(currentRound.scope)} • ${currentRound.status})` : '—'}
            </b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href={`/dashboard/lots/${lotId}`}>← Summary</Link>
          <Link href={`/dashboard/lots/${lotId}/items`}>Items</Link>
          <Link href={`/dashboard/lots/${lotId}/invite`}>Invite</Link>
          <button onClick={() => loadAll(tenantId)} style={{ padding: 10, borderRadius: 10 }} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <hr style={{ margin: '16px 0' }} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => setTab('list')}
          style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd', background: tab === 'list' ? '#f3f3f3' : 'white' }}
        >
          Offers list
        </button>
        <button
          onClick={() => setTab('detail')}
          style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd', background: tab === 'detail' ? '#f3f3f3' : 'white' }}
        >
          Offer detail
        </button>
        <button
          onClick={() => setTab('optimizer')}
          style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd', background: tab === 'optimizer' ? '#f3f3f3' : 'white' }}
        >
          Optimizer
        </button>
      </div>

      {tab === 'list' ? (
        <>
          <hr style={{ margin: '16px 0' }} />
          <h2>All offers ({offerComputed.length})</h2>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {offerComputed.map(({ offer: o, lineTotal, lineCount }) => (
              <div key={o.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 320 }}>
                    <div style={{ fontWeight: 900 }}>
                      {buyerLabel(o.buyers)}
                      <span style={{ marginLeft: 8, color: '#666', fontSize: 12 }}>• status: {o.status ?? '—'}</span>
                    </div>

                    <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', color: '#666', fontSize: 12 }}>
                      <span>Take-all: <b>{money(o.take_all_total, currency)}</b></span>
                      <span>Line total: <b>{money(lineTotal, currency)}</b></span>
                      <span>Lines priced: <b>{lineCount}</b></span>
                      <span>Credit: <b>{o.buyers?.credit_ok ? 'OK' : 'Flag'}</b></span>
                      <span>Reliability: <b>{o.buyers?.reliability_score ?? '—'}</b></span>
                      <span>Terms: <b>{o.buyers?.payment_terms ?? '—'}</b></span>
                    </div>

                    {o.notes ? <div style={{ marginTop: 8, color: '#666' }}>{o.notes}</div> : null}
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        setSelectedOfferId(o.id)
                        setTab('detail')
                      }}
                      style={{ padding: 10 }}
                    >
                      Review
                    </button>

                    <button
                      onClick={() => acceptTakeAllOffer(o)}
                      disabled={busy || !o.take_all_total}
                      style={{ padding: 10 }}
                      title={!o.take_all_total ? 'No take-all total on this offer' : 'Accept take-all and award items so invite winners/PO upload works'}
                    >
                      {busy ? 'Working…' : 'Accept (Take-all)'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {offerComputed.length === 0 ? <div style={{ color: '#666' }}>No offers yet.</div> : null}
          </div>

          <hr style={{ margin: '18px 0' }} />
          <h2>
            Awarded lines (this round){' '}
            <span style={{ color: '#666', fontSize: 12 }}>({awardedForCurrentRound.length})</span>
          </h2>

          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {awardedForCurrentRound.slice(0, 30).map((a) => (
              <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>
                  {a.line_items?.model ?? a.line_items?.description ?? a.line_item_id}
                </div>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Winner: <b>{buyerLabel(a.buyers)}</b></span>
                  <span>Qty: <b>{a.qty ?? a.line_items?.qty ?? '—'}</b></span>
                  <span>Unit: <b>{money(Number(a.unit_price ?? 0), currency)}</b></span>
                  <span>Extended: <b>{money(Number(a.extended ?? 0), currency)}</b></span>
                </div>
              </div>
            ))}
            {awardedForCurrentRound.length === 0 ? <div style={{ color: '#666' }}>No lines awarded in this round yet.</div> : null}
            {awardedForCurrentRound.length > 30 ? <div style={{ color: '#666', fontSize: 12 }}>Showing first 30…</div> : null}
          </div>
        </>
      ) : null}

      {tab === 'detail' ? (
        <>
          <hr style={{ margin: '16px 0' }} />
          <h2>Offer detail</h2>

          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={selectedOfferId}
              onChange={(e) => setSelectedOfferId(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd', minWidth: 320 }}
            >
              <option value="">Select an offer…</option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {buyerLabel(o.buyers)}
                </option>
              ))}
            </select>

            {selectedOffer ? (
              <button
                onClick={() => acceptTakeAllOffer(selectedOffer)}
                disabled={busy || !selectedOffer.take_all_total}
                style={{ padding: 10, borderRadius: 10 }}
                title={!selectedOffer.take_all_total ? 'No take-all total on this offer' : 'Accept take-all and award items so invite winners/PO upload works'}
              >
                {busy ? 'Working…' : 'Accept (Take-all)'}
              </button>
            ) : null}
          </div>

          {!selectedOffer ? (
            <div style={{ marginTop: 12, color: '#666' }}>Choose an offer to review.</div>
          ) : (
            <>
              <div style={{ marginTop: 12, border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>{buyerLabel(selectedOffer.buyers)}</div>
                <div style={{ marginTop: 6, color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                  <span>Status: <b>{selectedOffer.status ?? '—'}</b></span>
                  <span>Take-all: <b>{money(selectedOffer.take_all_total, currency)}</b></span>
                  <span>Lines priced: <b>{selectedOfferLines.filter((l) => l.unit_price != null).length}</b></span>
                </div>
                {selectedOffer.notes ? <div style={{ marginTop: 8, color: '#666' }}>{selectedOffer.notes}</div> : null}
              </div>

              <h3 style={{ marginTop: 16 }}>Line offers</h3>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedOfferLines
                  .filter((l) => l.unit_price != null)
                  .map((l) => {
                    const it = itemById.get(l.line_item_id)
                    const qty = it?.qty ?? l.qty_snapshot ?? 0
                    const ext = Number(l.unit_price ?? 0) * Number(qty)
                    return (
                      <div key={l.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 900 }}>
                          {it?.model ?? it?.description ?? l.line_item_id}
                        </div>
                        <div style={{ marginTop: 6, color: '#666', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>Qty: <b>{qty}</b></span>
                          <span>Unit: <b>{money(Number(l.unit_price ?? 0), currency)}</b></span>
                          <span>Extended: <b>{money(Number(ext ?? 0), currency)}</b></span>
                          <span>Ask: <b>{money(Number(it?.asking_price ?? 0), currency)}</b></span>
                        </div>
                      </div>
                    )
                  })}

                {selectedOfferLines.filter((l) => l.unit_price != null).length === 0 ? (
                  <div style={{ color: '#666' }}>No line-by-line prices on this offer.</div>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : null}

      {tab === 'optimizer' ? (
        <>
          <hr style={{ margin: '16px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>Optimizer (max revenue per line)</h2>
              <div style={{ color: '#666' }}>
                Picks the highest <b>unit price</b> per line and totals the result.
              </div>
              <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>
                Awarding into: <b>{currentRound ? `R${currentRound.round_number} (${scopeLabel(currentRound.scope)} • ${currentRound.status})` : '—'}</b>
              </div>
            </div>

            <button onClick={awardOptimizerLines} style={{ padding: 12, borderRadius: 10 }} disabled={busy}>
              {busy ? 'Working…' : 'Award these lines'}
            </button>
          </div>

          <div style={{ marginTop: 12, color: '#666' }}>
            Optimized grand total: <b>{money(optimizerGrandTotal, currency)}</b> • Lines with bids: <b>{optimizerWinners.length}</b>
          </div>

          <hr style={{ margin: '16px 0' }} />

          <h3>Totals by buyer</h3>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {optimizerTotalsByBuyer.map((r) => (
              <div key={r.buyer_id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>{buyerLabel(r.buyer)}</div>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12 }}>
                  Lines won: <b>{r.lines}</b> • Total: <b>{money(r.total, currency)}</b>
                </div>
              </div>
            ))}
            {optimizerTotalsByBuyer.length === 0 ? <div style={{ color: '#666' }}>No line-by-line bids to optimize yet.</div> : null}
          </div>

          <hr style={{ margin: '16px 0' }} />

          <h3>Winning bid per line</h3>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {optimizerWinners.map((r) => (
              <div key={r.line_item_id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 900 }}>
                  {r.item?.model ?? r.item?.description ?? r.line_item_id}
                </div>
                <div style={{ marginTop: 6, color: '#666', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>Winner: <b>{buyerLabel(r.offer.buyers)}</b></span>
                  <span>Qty: <b>{r.qty}</b></span>
                  <span>Unit: <b>{money(r.unit, currency)}</b></span>
                  <span>Extended: <b>{money(r.extended, currency)}</b></span>
                  <span>Ask: <b>{money(Number(r.item?.asking_price ?? 0), currency)}</b></span>
                </div>
              </div>
            ))}

            {optimizerWinners.length === 0 ? <div style={{ color: '#666' }}>No winning lines found (no unit prices submitted yet).</div> : null}
          </div>

          <hr style={{ margin: '18px 0' }} />
          <h3>Current awarded lines (this round)</h3>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {awardedForCurrentRound.length === 0 ? (
              <div style={{ color: '#666' }}>None awarded in this round yet. Click “Award these lines”.</div>
            ) : (
              awardedForCurrentRound.slice(0, 50).map((a) => (
                <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 900 }}>
                    {a.line_items?.model ?? a.line_items?.description ?? a.line_item_id}
                  </div>
                  <div style={{ marginTop: 6, color: '#666', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>Winner: <b>{buyerLabel(a.buyers)}</b></span>
                    <span>Qty: <b>{a.qty ?? a.line_items?.qty ?? '—'}</b></span>
                    <span>Unit: <b>{money(Number(a.unit_price ?? 0), currency)}</b></span>
                    <span>Extended: <b>{money(Number(a.extended ?? 0), currency)}</b></span>
                  </div>
                </div>
              ))
            )}
            {awardedForCurrentRound.length > 50 ? <div style={{ color: '#666', fontSize: 12 }}>Showing first 50…</div> : null}
          </div>
        </>
      ) : null}
    </main>
  )
}
