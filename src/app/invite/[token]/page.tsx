'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type InviteRow = {
  id: string
  tenant_id: string | null
  lot_id: string | null
  buyer_id: string | null
  status: string | null
  created_at: string | null
  lots?: { title: string | null; status: string | null; currency: string | null }
  buyers?: { name: string | null; company: string | null; email: string | null }
}

type LineItem = {
  id: string
  lot_id: string | null
  description: string | null
  model: string | null
  qty: number | null
  serial_tag: string | null
  cpu: string | null
  cpu_qty: number | null
  memory_part_numbers: string | null
  memory_qty: number | null
  network_card: string | null
  expansion_card: string | null
  gpu: string | null
  asking_price: number | null
  specs: Record<string, unknown> | null
}

type PoUpload = {
  id: string
  file_name: string | null
  file_path: string
  created_at: string
}

type OfferSummary = {
  anyOffers: boolean
  hasTakeAll: boolean
  hasPartial: boolean
  acceptedOffer: boolean
}

type ComponentKey = 'cpu' | 'memory' | 'network' | 'expansion' | 'gpu' | 'drives'

const componentLabels: Record<ComponentKey, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  network: 'Network',
  expansion: 'Expansion',
  gpu: 'GPU',
  drives: 'Drives',
}
const componentKeys: ComponentKey[] = ['cpu', 'memory', 'network', 'expansion', 'gpu', 'drives']

const fallback = (v: string | null | undefined, alt = '—') => (v && String(v).trim().length ? String(v) : alt)

const formatCpu = (li: LineItem) => {
  if (!li.cpu) return '—'
  const qty = li.cpu_qty ? ` x${li.cpu_qty}` : ''
  return `${li.cpu}${qty}`
}

const formatMemory = (li: LineItem) => {
  const qty = li.memory_qty ? `${li.memory_qty} DIMMs` : ''
  const pn = li.memory_part_numbers ? li.memory_part_numbers : ''
  if (!qty && !pn) return '—'
  return [pn, qty].filter(Boolean).join(' • ')
}

const formatMoney = (val: number | null | undefined, currency?: string | null) => {
  if (val === null || val === undefined) return '—'
  const cur = currency ?? ''
  return `${val.toLocaleString()} ${cur}`.trim()
}

export default function InviteTokenPage() {
  const params = useParams()
  const token = (params?.token as string) || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<InviteRow | null>(null)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [poUploads, setPoUploads] = useState<PoUpload[]>([])
  const [offerSummary, setOfferSummary] = useState<OfferSummary>({
    anyOffers: false,
    hasTakeAll: false,
    hasPartial: false,
    acceptedOffer: false,
  })
  const [isWinner, setIsWinner] = useState(false)

  const [offerValue, setOfferValue] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const [lineMode, setLineMode] = useState(false)
  const [manualLineOffers, setManualLineOffers] = useState<Record<string, string>>({})
  const [showSpecs, setShowSpecs] = useState(false)

  const [componentSelected, setComponentSelected] = useState<Record<string, Partial<Record<ComponentKey, boolean>>>>({})
  const [componentPrices, setComponentPrices] = useState<Record<string, Partial<Record<ComponentKey, string>>>>({})

  const parseMoney = (v: string) => {
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const componentQty = (li: LineItem, key: ComponentKey) => {
    if (key === 'cpu') return li.cpu_qty ?? 1
    if (key === 'memory') return li.memory_qty ?? 1
    if (key === 'drives') {
      const specs = li.specs && typeof li.specs === 'object' ? li.specs : {}
      const drivesQty = typeof specs?.drives_qty === 'number' ? specs.drives_qty : null
      return drivesQty ?? 1
    }
    return 1
  }

  const hasComponent = (li: LineItem, key: ComponentKey) => {
    if (key === 'cpu') return Boolean(li.cpu)
    if (key === 'memory') return Boolean(li.memory_part_numbers || li.memory_qty)
    if (key === 'network') return Boolean(li.network_card)
    if (key === 'expansion') return Boolean(li.expansion_card)
    if (key === 'gpu') return Boolean(li.gpu)
    if (key === 'drives') {
      const specs = li.specs && typeof li.specs === 'object' ? li.specs : {}
      return Boolean(specs?.drives || specs?.drives_qty)
    }
    return false
  }

  const componentTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const li of lineItems) {
      const selections = componentSelected[li.id] || {}
      const prices = componentPrices[li.id] || {}
      let sum = 0
      componentKeys.forEach((key) => {
        if (!hasComponent(li, key)) return
        if (!selections[key]) return
        const price = parseMoney(prices[key] ?? '')
        if (price == null) return
        const qty = componentQty(li, key)
        sum += price * qty
      })
      totals[li.id] = sum
    }
    return totals
  }, [componentSelected, componentPrices, lineItems])

  const lineOfferTotal = useMemo(
    () =>
      lineItems.reduce((sum, li) => {
        const compTotal = componentTotals[li.id]
        const manualVal = parseMoney(manualLineOffers[li.id] ?? '')
        const unitPrice = compTotal && compTotal > 0 ? compTotal : manualVal
        if (unitPrice == null) return sum
        const qty = li.qty ?? 1
        return sum + unitPrice * qty
      }, 0),
    [componentTotals, lineItems, manualLineOffers]
  )

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')

        const { data, error: inviteErr } = await supabase
          .from('lot_invites')
          .select('id,tenant_id,lot_id,buyer_id,status,created_at,lots(title,status,currency),buyers(name,company,email)')
          .eq('token', token)
          .maybeSingle()

        if (inviteErr) throw inviteErr
        if (!data) throw new Error('Invite not found or expired')

        const buyerRaw = Array.isArray((data as any)?.buyers) ? (data as any).buyers[0] : (data as any)?.buyers
        const lotRaw = Array.isArray((data as any)?.lots) ? (data as any).lots[0] : (data as any)?.lots
        const normalizedInvite: InviteRow = {
          id: String((data as any)?.id ?? ''),
          tenant_id: (data as any)?.tenant_id ?? null,
          lot_id: (data as any)?.lot_id ?? null,
          buyer_id: (data as any)?.buyer_id ?? null,
          status: (data as any)?.status ?? null,
          created_at: (data as any)?.created_at ?? null,
          lots: lotRaw
            ? {
                title: lotRaw.title ?? null,
                status: lotRaw.status ?? null,
                currency: lotRaw.currency ?? null,
              }
            : undefined,
          buyers: buyerRaw
            ? {
                name: buyerRaw.name ?? null,
                company: buyerRaw.company ?? null,
                email: buyerRaw.email ?? null,
              }
            : undefined,
        }

        setInvite(normalizedInvite)

        if (data?.lot_id) {
          const { data: liData, error: liErr } = await supabase
            .from('line_items')
            .select(
              'id,lot_id,description,model,qty,serial_tag,cpu,cpu_qty,memory_part_numbers,memory_qty,network_card,expansion_card,gpu,asking_price,specs'
            )
            .eq('lot_id', data.lot_id)
            .order('id', { ascending: true })
            .limit(500)

          if (liErr) throw liErr
          const rows = (liData as LineItem[]) ?? []
          setLineItems(rows)
          const manualInit: Record<string, string> = {}
          const selectedInit: Record<string, Partial<Record<ComponentKey, boolean>>> = {}
          const pricesInit: Record<string, Partial<Record<ComponentKey, string>>> = {}
          for (const li of rows) {
            manualInit[li.id] = ''
            selectedInit[li.id] = {}
            pricesInit[li.id] = {}
          }
          setManualLineOffers(manualInit)
          setComponentSelected(selectedInit)
          setComponentPrices(pricesInit)
        }

        // Load PO uploads for this invite/lot
        if (data?.lot_id && data?.id) {
          const { data: poData } = await supabase
            .from('po_uploads')
            .select('id,file_name,file_path,created_at')
            .eq('lot_id', data.lot_id)
            .eq('invite_id', data.id)
            .order('created_at', { ascending: false })
            .limit(20)
          setPoUploads((poData as PoUpload[]) ?? [])
        }

        // Offer summary (for status chips)
        if (data?.lot_id) {
          const { data: offers } = await supabase
            .from('offers')
            .select('id,take_all_total,status')
            .eq('lot_id', data.lot_id)
            .limit(200)
          const anyOffers = Array.isArray(offers) && offers.length > 0
          const hasTakeAll = Array.isArray(offers) && offers.some((o) => o.take_all_total != null)
          const hasPartial = Array.isArray(offers) && offers.some((o) => o.take_all_total == null)
          const acceptedOffer = Array.isArray(offers) && offers.some((o) => o.status === 'accepted')
          setOfferSummary({ anyOffers, hasTakeAll, hasPartial, acceptedOffer })
        }

        // Winner check (awarded_lines for this buyer/lot)
        if (data?.lot_id && data?.buyer_id) {
          const { data: awards } = await supabase
            .from('awarded_lines')
            .select('id')
            .eq('lot_id', data.lot_id)
            .eq('buyer_id', data.buyer_id)
            .limit(1)
          setIsWinner(Array.isArray(awards) && awards.length > 0)
        }
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load invite'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  const submitOffer = async () => {
    if (!invite) return

    const parsed = offerValue ? Number(offerValue) : null
    if (offerValue && Number.isNaN(parsed)) {
      setSubmitError('Enter a valid number')
      return
    }

    const linePayload = lineItems
      .map((li) => {
        const compTotal = componentTotals[li.id]
        const manualVal = parseMoney(manualLineOffers[li.id] ?? '')
        const unitPrice = compTotal && compTotal > 0 ? compTotal : manualVal
        if (unitPrice == null) return null
        return {
          offer_id: '',
          line_item_id: li.id,
          unit_price: unitPrice,
          qty_snapshot: li.qty ?? 1,
          currency: invite.lots?.currency ?? null,
        }
      })
      .filter(Boolean) as Array<{
      offer_id: string
      line_item_id: string
      unit_price: number
      qty_snapshot: number
      currency: string | null
    }>

    const combinedNotes = [notes].filter((v) => v && v.trim().length).join('\n\n')

    const usingLineMode = lineMode && linePayload.length > 0
    const totalFromLines = usingLineMode ? lineOfferTotal : null
    if (lineMode && linePayload.length === 0) {
      setSubmitError('Enter at least one line price or disable line-by-line mode.')
      return
    }

    try {
      setSubmitting(true)
      setSubmitError('')

      const { data: offerData, error: offerErr } = await supabase
        .from('offers')
        .insert({
          tenant_id: invite.tenant_id,
          lot_id: invite.lot_id,
          buyer_id: invite.buyer_id,
          invite_id: invite.id,
          total_offer: usingLineMode ? totalFromLines : parsed,
          notes: combinedNotes || null,
          currency: invite.lots?.currency ?? null,
          status: 'new',
        })
        .select('id')
        .single()

      if (offerErr) throw offerErr
      const offerId = (offerData as { id: string } | null)?.id

      if (usingLineMode && offerId) {
        const payload = linePayload.map((p) => ({
          ...p,
          offer_id: offerId,
        }))
        const { error: lineErr } = await supabase.from('offer_lines').insert(payload)
        if (lineErr) throw lineErr
      }

      setSubmitted(true)
    } catch (e: unknown) {
      console.error('submitOffer error', e)
      // Duplicate key (e.g., unique constraint offers_lot_buyer_uq)
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code?: unknown }).code) : ''
      if (code === '23505') {
        setSubmitError('You already have an offer for this lot. Please contact the broker to revise it.')
      } else {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e !== null && 'message' in e
              ? String((e as { message?: unknown }).message)
              : JSON.stringify(e ?? {}) || 'Offer submit failed'
        setSubmitError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
        <div>Loading invite...</div>
      </main>
    )
  }

  if (error) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
        <div style={{ color: 'crimson' }}>{error}</div>
      </main>
    )
  }

  if (!invite) return null

  const currency = invite.lots?.currency ?? ''
  const lotStatus = (invite.lots?.status ?? '').toLowerCase() || 'unknown'
  const statusLabelMap: Record<string, string> = {
    draft: 'Draft',
    open: 'Open',
    offers_received: 'Offers received',
    awarded: 'Awarded',
    sale_in_progress: 'PO received',
    order_processing: 'Order processing',
    sold: 'Sold',
    closed: 'Closed',
  }
  const lotStatusLabel = statusLabelMap[lotStatus] ?? 'Unknown'

  const offerChip =
    lotStatus === 'awarded'
      ? 'Offer accepted'
      : offerSummary.hasTakeAll
        ? 'Take-all offer received'
        : offerSummary.hasPartial
          ? 'Partial offers received'
          : 'No offers yet'

  return (
    <main
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg, #0b1220)',
        color: 'var(--text, #e5e7eb)',
      }}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          border: '1px solid var(--border, #1f2937)',
          borderRadius: 18,
          padding: 22,
          background: 'var(--panel, #0f172a)',
          color: 'var(--text, #e5e7eb)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
        }}
      >
        {lotStatus === 'awarded' && isWinner ? (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(16,185,129,0.35)',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(34,197,94,0.12))',
              color: '#0f5132',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, color: '#0f5132' }}>You have been awarded this lot.</div>
            <div style={{ marginTop: 4, color: '#0f5132' }}>
              Submit your PO below. Further offers will not change the award.
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'baseline',
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Offer on lot</div>
            <div style={{ color: 'var(--muted, #94a3b8)', marginTop: 4 }}>
              Token: <b style={{ color: 'var(--text, #e5e7eb)' }}>{token.slice(0, 8)}...</b>
            </div>
          </div>

          <Link
            href="/login"
            style={{
              textDecoration: 'none',
              fontWeight: 900,
              color: 'var(--accent, #38bdf8)',
              border: '1px solid var(--border, #1f2937)',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2, #0b1220)',
            }}
          >
            Broker login
          </Link>
        </div>

        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div
            style={{
              padding: 12,
              border: '1px solid var(--border, #1f2937)',
              borderRadius: 12,
              background: 'var(--panel-2, #0b1220)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Lot</div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '1px solid var(--border, #1f2937)',
                      background: 'rgba(56,189,248,0.12)',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    Status: {lotStatusLabel} ({offerChip})
                    <button
                      onClick={() => window.location.reload()}
                      style={{
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #1f2937)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'var(--text, #e5e7eb)',
                    cursor: 'pointer',
                  }}
                >
                  Refresh
                </button>
              </div>
            </div>
            <div style={{ marginTop: 6, color: 'var(--text, #e5e7eb)' }}>{invite.lots?.title || '(Untitled lot)'}</div>
            <div style={{ marginTop: 4, color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
              Status: {invite.lots?.status || 'n/a'} • Currency: {currency || 'n/a'}
            </div>
          </div>

          <div
            style={{
              padding: 12,
              border: '1px solid var(--border, #1f2937)',
              borderRadius: 12,
              background: 'var(--panel-2, #0b1220)',
            }}
          >
            <div style={{ fontWeight: 900 }}>Buyer</div>
            <div style={{ marginTop: 6, color: 'var(--text, #e5e7eb)' }}>{invite.buyers?.name || '(No name)'}</div>
            <div style={{ marginTop: 2, color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
              {invite.buyers?.company || 'No company'} • {invite.buyers?.email || 'No email'}
            </div>
            <div style={{ marginTop: 6, color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
              Invite status: {invite.status || 'invited'}
            </div>
          </div>
        </div>

        {lineItems.length ? (
          <div
            style={{
              marginTop: 16,
              borderTop: '1px solid var(--border, #1f2937)',
              paddingTop: 14,
              display: 'grid',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>Line items</div>
                <div style={{ color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
                  Toggle line pricing to price components or whole units. Without it, you can still make a take-all offer below.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
                  <input type="checkbox" checked={showSpecs} onChange={(e) => setShowSpecs(e.target.checked)} />
                  Show detailed specs
                </label>
                <button
                  onClick={() => setLineMode((v) => !v)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border, #1f2937)',
                    background: lineMode ? '#111827' : 'transparent',
                    color: lineMode ? '#fff' : 'var(--text, #e5e7eb)',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {lineMode ? 'Disable line pricing' : 'Enable line pricing'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {lineItems.map((li) => {
                const specs = li.specs && typeof li.specs === 'object' ? li.specs : {}
                const drives = typeof specs?.drives === 'string' ? specs.drives : null
                const drivesQty = typeof specs?.drives_qty === 'number' ? specs.drives_qty : null
                const details = [
                  { label: 'OEM', value: fallback(li.description) },
                  { label: 'Model', value: fallback(li.model) },
                  { label: 'CPU', value: formatCpu(li) },
                  { label: 'Memory', value: formatMemory(li) },
                  { label: 'Network', value: fallback(li.network_card) },
                  { label: 'Expansion', value: fallback(li.expansion_card) },
                  { label: 'GPU', value: fallback(li.gpu) },
                  { label: 'Drives', value: fallback(drives) },
                  { label: 'Drives QTY', value: drivesQty ?? '—' },
                  { label: 'Total QTY', value: li.qty ?? 1 },
                  { label: 'Asking Price', value: formatMoney(li.asking_price, currency) },
                  { label: 'Serial/Tag', value: fallback(li.serial_tag) },
                ]

                const compSelections = componentSelected[li.id] || {}
                const compPrices = componentPrices[li.id] || {}
                const compTotal = componentTotals[li.id] ?? 0

                return (
                  <div
                    key={li.id}
                    style={{
                      border: '1px solid var(--border, #1f2937)',
                      borderRadius: 12,
                      padding: 12,
                      background: 'var(--panel-2, #0b1220)',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{li.model || li.description || 'Line item'}</div>
                        {li.description && li.model && li.description !== li.model ? (
                          <div style={{ color: 'var(--muted, #94a3b8)', fontSize: 12 }}>{li.description}</div>
                        ) : null}
                      </div>
                      <div style={{ color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
                        Qty: <b style={{ color: 'var(--text, #e5e7eb)' }}>{li.qty ?? 1}</b>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: showSpecs ? 'repeat(auto-fit, minmax(180px, 1fr))' : 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 6,
                      }}
                    >
                      {details
                        .filter((d) => showSpecs || ['OEM', 'Model', 'Total QTY', 'Asking Price'].includes(d.label))
                        .map((d) => (
                          <div key={d.label} style={{ color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
                            <span style={{ fontWeight: 800, color: 'var(--text, #e5e7eb)' }}>{d.label}:</span> {d.value}
                          </div>
                        ))}
                    </div>

                    {lineMode ? (
                      <>
                        <div style={{ fontWeight: 800, marginTop: 4 }}>Component pricing (tick what you are buying)</div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                            gap: 8,
                          }}
                        >
                          {componentKeys.map((key) => {
                            const available = hasComponent(li, key)
                            const qty = componentQty(li, key)
                            const label = componentLabels[key]
                            return (
                              <div
                                key={key}
                                style={{
                                  border: '1px solid var(--border, #1f2937)',
                                  borderRadius: 10,
                                  padding: 8,
                                  opacity: available ? 1 : 0.5,
                                  background: 'var(--panel, #0f172a)',
                                }}
                              >
                                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, color: 'var(--text, #e5e7eb)' }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(compSelections[key])}
                                    disabled={!available}
                                    onChange={(e) =>
                                      setComponentSelected((prev) => ({
                                        ...prev,
                                        [li.id]: { ...(prev[li.id] || {}), [key]: e.target.checked },
                                      }))
                                    }
                                  />
                                  {label} {available ? '' : '(n/a)'}
                                </label>
                                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted, #94a3b8)' }}>
                                  Qty: <b style={{ color: 'var(--text, #e5e7eb)' }}>{qty}</b>
                                </div>
                                <input
                                  type="number"
                                  disabled={!available || !compSelections[key]}
                                  value={compPrices[key] ?? ''}
                                  onChange={(e) =>
                                    setComponentPrices((prev) => ({
                                      ...prev,
                                      [li.id]: { ...(prev[li.id] || {}), [key]: e.target.value },
                                    }))
                                  }
                                  placeholder={`Unit price per ${label}`}
                                  style={{
                                    width: '100%',
                                    padding: 8,
                                    borderRadius: 8,
                                    border: '1px solid var(--border, #1f2937)',
                                    background: 'var(--panel-2, #0b1220)',
                                    color: 'var(--text, #e5e7eb)',
                                    marginTop: 6,
                                  }}
                                />
                              </div>
                            )
                          })}
                        </div>

                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <label style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted, #94a3b8)' }}>
                          Whole unit price (auto from components if provided)
                        </span>
                        <input
                          type="number"
                          value={
                            (componentTotals[li.id] ?? 0) > 0
                              ? String(componentTotals[li.id])
                              : manualLineOffers[li.id] ?? ''
                          }
                          onChange={(e) =>
                            setManualLineOffers((prev) => ({
                              ...prev,
                              [li.id]: e.target.value,
                            }))
                          }
                          disabled={(componentTotals[li.id] ?? 0) > 0}
                          placeholder="e.g. 1200"
                          style={{
                            width: '100%',
                            padding: 8,
                            borderRadius: 8,
                            border: '1px solid var(--border, #1f2937)',
                            background: (componentTotals[li.id] ?? 0) > 0 ? '#0b1220' : 'var(--panel, #0f172a)',
                            color: 'var(--text, #e5e7eb)',
                            opacity: (componentTotals[li.id] ?? 0) > 0 ? 0.9 : 1,
                          }}
                        />
                      </label>
                    </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
                          <div>
                            Auto unit total from selected components:{' '}
                            <b style={{ color: 'var(--text, #e5e7eb)' }}>{formatMoney(compTotal || null, currency)}</b>
                          </div>
                          {compTotal > 0 ? (
                            <div style={{ color: 'var(--muted, #94a3b8)' }}>
                              Line will use component total; otherwise we use the whole unit price.
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {lineMode ? (
              <div
                style={{
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: 'var(--text, #e5e7eb)',
                }}
              >
                <div style={{ fontWeight: 900 }}>Line total (qty x unit):</div>
                <div style={{ fontWeight: 900 }}>{formatMoney(lineOfferTotal || 0, currency)}</div>
              </div>
            ) : null}
            <div style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center', color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={showSpecs} onChange={(e) => setShowSpecs(e.target.checked)} />
                Show detailed specs (CPU, DIMMs, network, expansion, GPU, drives)
              </label>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 16, borderTop: '1px solid var(--border, #1f2937)', paddingTop: 14 }}>
          <div style={{ fontWeight: 900 }}>Submit offer</div>
          <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
            {isWinner ? (
              <div style={{ padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div style={{ fontWeight: 900, color: '#10b981' }}>You are the awarded buyer for this lot.</div>
                <div style={{ color: 'var(--muted, #94a3b8)', marginTop: 4 }}>
                  Submit your PO below. Further offers will not change the award.
                </div>
              </div>
            ) : null}
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted, #94a3b8)' }}>
                Total offer amount {lineMode ? '(optional if using line pricing)' : ''}
              </label>
              <input
              type="number"
              value={offerValue}
              onChange={(e) => setOfferValue(e.target.value)}
              placeholder="e.g. 12000"
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border, #1f2937)',
                background: 'var(--panel-2, #0b1220)',
                color: 'var(--text, #e5e7eb)',
              }}
            />
          </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--muted, #94a3b8)' }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Add delivery timelines, exclusions, or other details"
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--border, #1f2937)',
                  background: 'var(--panel-2, #0b1220)',
                  color: 'var(--text, #e5e7eb)',
                  resize: 'vertical',
                }}
              />
            </div>

            {submitError ? <div style={{ color: 'crimson' }}>{submitError}</div> : null}
            {submitted ? (
              <div style={{ color: '#10b981', fontWeight: 700 }}>Offer submitted. The broker will review it shortly.</div>
            ) : null}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={submitOffer}
                disabled={submitting || submitted}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border, #1f2937)',
                  background: 'linear-gradient(135deg, var(--accent, #38bdf8) 0%, #6366f1 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: submitting || submitted ? 'not-allowed' : 'pointer',
                  opacity: submitting || submitted ? 0.7 : 1,
                }}
              >
                {submitting ? 'Submitting...' : submitted ? 'Submitted' : 'Submit offer'}
              </button>
              <div style={{ color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
                Powered by ITexchange • Need help? Reply to your invite email.
              </div>
            </div>
          </div>
        </div>

        {lotStatus === 'awarded' && isWinner ? (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border, #1f2937)', paddingTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Purchase Order upload</div>
            <div style={{ color: 'var(--muted, #94a3b8)', fontSize: 12, marginBottom: 8 }}>
              Congratulations, this invite has been awarded. Upload your PO here.
            </div>
            <form
              action={`/api/invite/${token}/po`}
              method="post"
              encType="multipart/form-data"
              style={{ display: 'grid', gap: 8, maxWidth: 420 }}
            >
              <input type="file" name="file" required />
              <textarea name="notes" rows={3} placeholder="Notes (optional)" style={{ padding: 8, borderRadius: 8 }} />
              <button
                type="submit"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border, #1f2937)',
                  background: 'linear-gradient(135deg, var(--accent, #38bdf8) 0%, #10b981 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Upload PO
              </button>
            </form>
            <div style={{ marginTop: 10, color: 'var(--muted, #94a3b8)', fontSize: 12 }}>
              Recent uploads:
              <ul>
                {poUploads.map((p) => (
                  <li key={p.id}>
                    {p.file_name ?? p.file_path} — {new Date(p.created_at).toLocaleString()}
                  </li>
                ))}
                {poUploads.length === 0 ? <li style={{ color: 'var(--muted, #94a3b8)' }}>(none)</li> : null}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
