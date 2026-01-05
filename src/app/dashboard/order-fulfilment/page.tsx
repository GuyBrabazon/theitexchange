'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Seller = {
  id: string
  tenant_id: string
  name: string | null
  company: string | null
  email: string | null
  phone: string | null
  created_at?: string | null
}

type LotRow = {
  id: string
  tenant_id: string
  title: string | null
  status: string | null
  currency: string | null
  created_at: string | null
  po_count: number | null
  last_po_at: string | null
  sale_in_progress_at: string | null

  seller_id: string | null
  sellers?: Seller | null
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function statusLabel(s: string | null | undefined) {
  const v = (s ?? '').toLowerCase().trim()
  if (!v) return 'Unknown'
  if (v === 'sale_in_progress') return 'PO received'
  if (v === 'order_processing') return 'Order processing'
  if (v === 'sold') return 'Sold'
  if (v === 'closed') return 'Closed'
  if (v === 'offers_received') return 'Offers received'
  if (v === 'awarded') return 'Awarded'
  if (v === 'open') return 'Open'
  if (v === 'draft') return 'Draft'
  return s ?? 'Unknown'
}

function badgeBg(status: string | null | undefined) {
  const v = (status ?? '').toLowerCase().trim()
  if (v === 'sale_in_progress') return '#111'
  if (v === 'order_processing') return 'rgba(245,174,109,0.18)'
  if (v === 'sold') return 'rgba(34,197,94,0.18)'
  if (v === 'offers_received') return 'rgba(56,189,248,0.18)'
  if (v === 'awarded') return 'rgba(74,222,128,0.18)'
  return 'rgba(255,255,255,0.06)'
}

/**
 * Best-effort notification insert.
 * We do NOT use `href` (you hit `column notifications.href does not exist` earlier).
 */
async function notifyTenant(opts: { tenant_id: string; lot_id: string; title: string; body: string; kind?: string }) {
  try {
    await supabase.from('notifications').insert({
      tenant_id: opts.tenant_id,
      lot_id: opts.lot_id,
      kind: opts.kind ?? 'order',
      title: opts.title,
      body: opts.body,
    })
  } catch {
    // swallow
  }
}

function sellerLabel(s: Seller | null | undefined) {
  if (!s) return 'Unassigned'
  if (s.company && s.name) return `${s.company} — ${s.name}`
  return s.company ?? s.name ?? 'Seller'
}

export default function OrderFulfilmentPage() {
  const [tenantId, setTenantId] = useState('')
  const [lots, setLots] = useState<LotRow[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tab, setTab] = useState<'queue' | 'processing' | 'sold' | 'all'>('queue')
  const [q, setQ] = useState('')

  const [savingLotId, setSavingLotId] = useState<string | null>(null)

  const loadSellers = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('sellers')
      .select('id,tenant_id,name,company,email,phone,created_at')
      .eq('tenant_id', tid)
      .order('company', { ascending: true })
      .order('name', { ascending: true })
      .limit(5000)

    if (error) throw error
    setSellers((data as Seller[]) ?? [])
  }, [])

  const loadLots = useCallback(async (tid: string) => {
    // Pull sellers relation if FK exists as lots.seller_id -> sellers.id
    const { data, error } = await supabase
      .from('lots')
      .select(
        `
        id,tenant_id,title,status,currency,created_at,po_count,last_po_at,sale_in_progress_at,seller_id,
        sellers ( id,tenant_id,name,company,email,phone )
      `
      )
      .eq('tenant_id', tid)
      .in('status', ['awarded', 'sale_in_progress', 'order_processing', 'sold'])
      .order('last_po_at', { ascending: false, nullsFirst: false })

    if (error) throw error
    setLots((data as LotRow[]) ?? [])
  }, [])

  const load = useCallback(async (tid: string) => {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadSellers(tid), loadLots(tid)])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load fulfilment queue'
      setError(msg)
      setLots([])
    } finally {
      setLoading(false)
    }
  }, [loadLots, loadSellers])

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true)
        const profile = await ensureProfile()
        setTenantId(profile.tenant_id)
        await load(profile.tenant_id)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to bootstrap tenant'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)

    return lots
      .filter((l) => {
        const st = (l.status ?? '').toLowerCase()

        if (tab === 'queue' && st !== 'sale_in_progress' && st !== 'awarded') return false
        if (tab === 'processing' && st !== 'order_processing') return false
        if (tab === 'sold' && st !== 'sold') return false

        if (!s) return true
        return hit(l.title) || hit(l.id) || hit(l.status) || hit(l.currency) || hit(l.sellers?.name) || hit(l.sellers?.company)
      })
      .sort((a, b) => {
        const ap = a.last_po_at ? Date.parse(a.last_po_at) : 0
        const bp = b.last_po_at ? Date.parse(b.last_po_at) : 0
        if (ap !== bp) return bp - ap

        const ac = a.created_at ? Date.parse(a.created_at) : 0
        const bc = b.created_at ? Date.parse(b.created_at) : 0
        if (ac !== bc) return bc - ac

        return (b.id ?? '').localeCompare(a.id ?? '')
      })
  }, [lots, tab, q])

  const patchStatus = async (lot: LotRow, next: 'order_processing' | 'sold') => {
    if (!tenantId) return

    const label = next === 'order_processing' ? 'Order processing' : 'Sold'
    const ok = confirm(`Mark "${lot.title ?? lot.id}" as ${label}?`)
    if (!ok) return

    try {
      setSavingLotId(lot.id)
      const { error } = await supabase.from('lots').update({ status: next }).eq('id', lot.id)
      if (error) throw error

      if (next === 'order_processing') {
        await notifyTenant({
          tenant_id: tenantId,
          lot_id: lot.id,
          title: 'Order marked processing',
          body: `${lot.title ?? 'Lot'} is now in Order processing.`,
          kind: 'order',
        })
      } else {
        await notifyTenant({
          tenant_id: tenantId,
          lot_id: lot.id,
          title: 'Lot marked sold',
          body: `${lot.title ?? 'Lot'} was marked Sold.`,
          kind: 'order',
        })
      }

      await loadLots(tenantId)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to update lot status'
      alert(msg)
    } finally {
      setSavingLotId(null)
    }
  }

  const assignSeller = async (lot: LotRow, sellerId: string | null) => {
    if (!tenantId) return

    try {
      setSavingLotId(lot.id)
      const { error } = await supabase.from('lots').update({ seller_id: sellerId }).eq('id', lot.id)
      if (error) throw error

      const chosen = sellers.find((s) => s.id === sellerId) ?? null
      await notifyTenant({
        tenant_id: tenantId,
        lot_id: lot.id,
        title: sellerId ? 'Seller assigned' : 'Seller unassigned',
        body: sellerId ? `Seller set to: ${sellerLabel(chosen)}.` : `Seller was removed from ${lot.title ?? 'lot'}.`,
        kind: 'order',
      })

      await loadLots(tenantId)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to assign seller'
      alert(msg)
    } finally {
      setSavingLotId(null)
    }
  }

  const queueCount = useMemo(
    () => lots.filter((l) => ['sale_in_progress', 'awarded'].includes((l.status ?? '').toLowerCase())).length,
    [lots]
  )
  const processingCount = useMemo(() => lots.filter((l) => (l.status ?? '').toLowerCase() === 'order_processing').length, [lots])
  const soldCount = useMemo(() => lots.filter((l) => (l.status ?? '').toLowerCase() === 'sold').length, [lots])

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Order Fulfilment</h1>
          <div style={{ color: 'var(--muted)' }}>Move lots from PO received → processing → sold, and assign a seller.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lots / sellers…"
            style={{
              width: 320,
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--panel)',
              color: 'var(--text)',
            }}
          />

          <button
            onClick={() => tenantId && load(tenantId)}
            disabled={!tenantId || loading}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => setTab('queue')}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: tab === 'queue' ? 'rgba(245,174,109,0.16)' : 'var(--panel)',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          Queue (PO received) <span style={{ opacity: 0.75 }}>• {queueCount}</span>
        </button>

        <button
          onClick={() => setTab('processing')}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: tab === 'processing' ? 'rgba(245,174,109,0.16)' : 'var(--panel)',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          Processing <span style={{ opacity: 0.75 }}>• {processingCount}</span>
        </button>

        <button
          onClick={() => setTab('sold')}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: tab === 'sold' ? 'rgba(245,174,109,0.16)' : 'var(--panel)',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          Sold <span style={{ opacity: 0.75 }}>• {soldCount}</span>
        </button>

        <button
          onClick={() => setTab('all')}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: tab === 'all' ? 'rgba(245,174,109,0.16)' : 'var(--panel)',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          All
        </button>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}
      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}

      {!loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((l) => {
            const st = (l.status ?? '').toLowerCase()
            const poCount = Number(l.po_count ?? 0)
            const isSaving = savingLotId === l.id

            return (
              <div
                key={l.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  padding: 12,
                  background: 'var(--panel)',
                  boxShadow: 'var(--shadow)',
                  opacity: isSaving ? 0.85 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 340, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>
                        <Link href={`/dashboard/lots/${l.id}`} style={{ textDecoration: 'none' }}>
                          {l.title ?? 'Untitled lot'}
                        </Link>
                      </div>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: '1px solid var(--border)',
                          background: badgeBg(l.status),
                          fontSize: 12,
                          fontWeight: 950,
                        }}
                      >
                        {statusLabel(l.status)}
                      </span>

                      {poCount ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: '1px solid var(--border)',
                            background: 'rgba(255,255,255,0.06)',
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                          title="Purchase orders received for this lot"
                        >
                          PO(s): {poCount}
                        </span>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        Currency: <b style={{ color: 'var(--text)' }}>{l.currency ?? '—'}</b>
                      </span>
                      <span>
                        Last PO: <b style={{ color: 'var(--text)' }}>{fmtDate(l.last_po_at)}</b>
                      </span>
                      <span>
                        Sale started: <b style={{ color: 'var(--text)' }}>{fmtDate(l.sale_in_progress_at)}</b>
                      </span>
                    </div>

                    {/* Seller assignment */}
                    <div
                      style={{
                        marginTop: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 14,
                        padding: 10,
                        background: 'rgba(0,0,0,0.12)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 220 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Seller</div>
                        <div style={{ fontWeight: 950 }}>{sellerLabel(l.sellers ?? null)}</div>
                        <div style={{ marginTop: 2, color: 'var(--muted)', fontSize: 12 }}>
                          {l.sellers?.email ? l.sellers.email : '—'}
                          {l.sellers?.phone ? ` • ${l.sellers.phone}` : ''}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={l.seller_id ?? ''}
                          onChange={(e) => assignSeller(l, e.target.value || null)}
                          disabled={isSaving}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                            background: 'var(--panel)',
                            color: 'var(--text)',
                            fontWeight: 900,
                            minWidth: 260,
                          }}
                          title="Assign seller to this lot"
                        >
                          <option value="">— Unassigned —</option>
                          {sellers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {sellerLabel(s)}
                            </option>
                          ))}
                        </select>

                        {l.seller_id ? (
                          <button
                            onClick={() => assignSeller(l, null)}
                            disabled={isSaving}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 12,
                              border: '1px solid var(--border)',
                              background: 'rgba(255,255,255,0.06)',
                              color: 'var(--text)',
                              fontWeight: 900,
                              cursor: 'pointer',
                            }}
                            title="Remove seller assignment"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Link
                      href={`/dashboard/lots/${l.id}`}
                      style={{
                        textDecoration: 'none',
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontWeight: 900,
                      }}
                    >
                      Overview
                    </Link>

                    <Link
                      href={`/dashboard/lots/${l.id}/pos`}
                      style={{
                        textDecoration: 'none',
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'rgba(245,174,109,0.12)',
                        fontWeight: 950,
                      }}
                      title="View purchase orders for this lot"
                    >
                      View PO(s)
                    </Link>

                    {st === 'sale_in_progress' || st === 'awarded' ? (
                      <button
                        onClick={() => patchStatus(l, 'order_processing')}
                        disabled={isSaving}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                          color: '#fff',
                          fontWeight: 950,
                          cursor: 'pointer',
                        }}
                      >
                        {isSaving ? 'Working…' : 'Mark processing'}
                      </button>
                    ) : null}

                    {st === 'order_processing' ? (
                      <button
                        onClick={() => patchStatus(l, 'sold')}
                        disabled={isSaving}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          background: 'rgba(34,197,94,0.18)',
                          color: 'var(--text)',
                          fontWeight: 950,
                          cursor: 'pointer',
                        }}
                      >
                        {isSaving ? 'Working…' : 'Mark sold'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}

          {filtered.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>
              No lots in this view yet.
              <div style={{ marginTop: 8, fontSize: 12 }}>
                Tip: A lot enters this page after a buyer uploads a PO (status becomes <b>sale_in_progress</b>).
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
