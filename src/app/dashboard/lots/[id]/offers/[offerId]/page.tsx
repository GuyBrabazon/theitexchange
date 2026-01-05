'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Offer = {
  id: string
  lot_id: string
  buyer_id: string
  status: string | null
  created_at: string
  buyers?: { name: string; company: string | null; email: string | null } | null
}

type OfferLineJoined = {
  id: string
  offer_id: string
  line_item_id: string
  unit_price: number | null
  currency: string | null
  qty_snapshot: number | null
  line_items?: {
    id: string
    description: string | null
    qty: number | null
    model: string | null
    serial_tag: string | null
    cpu: string | null
    cpu_qty: number | null
    memory_part_numbers: string | null
    memory_qty: number | null
    network_card: string | null
    expansion_card: string | null
    gpu: string | null
  } | null
}

function money(n: number | null | undefined, currency: string) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${n} ${currency}`
}

export default function OfferLinesPage() {
  const params = useParams()
  const lotId = params.id as string
  const offerId = params.offerId as string

  const [, setTenantId] = useState('')
  const [offer, setOffer] = useState<Offer | null>(null)
  const [lines, setLines] = useState<OfferLineJoined[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const currency = useMemo(() => {
    // Offer lines can store currency, but if mixed, show fallback.
    const c = lines.find((l) => l.currency)?.currency
    return c ?? 'USD'
  }, [lines])

  const load = useCallback(async (tid: string) => {
    setLoading(true)
    try {
      const { data: off, error: offErr } = await supabase
        .from('offers')
        .select('id,lot_id,buyer_id,status,created_at, buyers(name,company,email)')
        .eq('tenant_id', tid)
        .eq('id', offerId)
        .single()
      if (offErr) throw offErr
      setOffer(off as Offer)

      const { data, error } = await supabase
        .from('offer_lines')
        .select(
          `
          id,offer_id,line_item_id,unit_price,currency,qty_snapshot,
          line_items (
            id,description,qty,model,serial_tag,cpu,cpu_qty,memory_part_numbers,memory_qty,network_card,expansion_card,gpu
          )
        `
        )
        .eq('offer_id', offerId)
        .order('id', { ascending: false })
      if (error) throw error

      // only show priced lines
      const priced = ((data as OfferLineJoined[]) ?? []).filter((r) => r.unit_price !== null)
      setLines(priced)
    } finally {
      setLoading(false)
    }
  }, [offerId])

  useEffect(() => {
    const init = async () => {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)
      await load(profile.tenant_id)
    }
    init().catch((e) => {
      console.error(e)
      alert(e?.message ?? 'Failed to load offer lines')
    })
  }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return lines
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)
    return lines.filter((l) => {
      const it = l.line_items
      return (
        hit(it?.model) ||
        hit(it?.description) ||
        hit(it?.serial_tag) ||
        hit(it?.cpu) ||
        hit(it?.memory_part_numbers) ||
        hit(it?.network_card) ||
        hit(it?.expansion_card) ||
        hit(it?.gpu)
      )
    })
  }, [lines, q])

  const subtotal = useMemo(() => {
    let s = 0
    for (const l of filtered) {
      const qty = l.qty_snapshot ?? l.line_items?.qty ?? 0
      const unit = l.unit_price ?? 0
      s += unit * qty
    }
    return s
  }, [filtered])

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>

  const buyerLabel = offer?.buyers
    ? offer.buyers.company
      ? `${offer.buyers.company} — ${offer.buyers.name}`
      : offer.buyers.name
    : offer?.buyer_id ?? '(buyer)'

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Line-by-line offer</h1>
          <div style={{ color: '#666' }}>
            Lot: <b>{lotId}</b> • Buyer: <b>{buyerLabel}</b>
          </div>
          <div style={{ color: '#666', marginTop: 4 }}>
            Lines priced: <b>{lines.length}</b> • Subtotal (filtered): <b>{money(subtotal, currency)}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={`/dashboard/lots/${lotId}/offers`}>← Back to offers</Link>
          <Link href={`/dashboard/lots/${lotId}`}>Lot summary →</Link>
        </div>
      </div>

      <hr style={{ margin: '18px 0' }} />

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search priced lines (model, serial, part number...)"
        style={{ width: 420, padding: 10, border: '1px solid #ddd', borderRadius: 10 }}
      />

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((l) => {
          const it = l.line_items
          const qty = l.qty_snapshot ?? it?.qty ?? 0
          const ext = (l.unit_price ?? 0) * qty

          return (
            <div key={l.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 420 }}>
                  <div style={{ fontWeight: 900 }}>{it?.model ?? it?.description ?? l.line_item_id}</div>
                  {it?.description && it?.model && it.description !== it.model ? (
                    <div style={{ color: '#666', marginTop: 2 }}>{it.description}</div>
                  ) : null}

                  <div style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap', color: '#666', fontSize: 12 }}>
                    <span>Qty: <b>{qty}</b></span>
                    {it?.serial_tag ? <span>Serial: <b>{it.serial_tag}</b></span> : null}
                    {it?.cpu ? <span>CPU: <b>{it.cpu}{it.cpu_qty ? ` (${it.cpu_qty})` : ''}</b></span> : null}
                    {it?.memory_part_numbers ? <span>Mem PN: <b>{it.memory_part_numbers}</b></span> : null}
                    {it?.memory_qty ? <span>DIMMs: <b>{it.memory_qty}</b></span> : null}
                    {it?.network_card ? <span>NIC: <b>{it.network_card}</b></span> : null}
                    {it?.expansion_card ? <span>Expansion: <b>{it.expansion_card}</b></span> : null}
                    {it?.gpu ? <span>GPU: <b>{it.gpu}</b></span> : null}
                  </div>
                </div>

                <div style={{ minWidth: 320 }}>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#666' }}>Unit</div>
                      <div style={{ fontWeight: 900 }}>{money(l.unit_price, currency)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#666' }}>Extended</div>
                      <div style={{ fontWeight: 900 }}>{money(ext, currency)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {filtered.length === 0 ? <div style={{ color: '#666' }}>No priced lines match your search.</div> : null}
      </div>
    </main>
  )
}
