'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ensureProfile } from '@/lib/bootstrap'

type LotRow = {
  id: string
  tenant_id: string
  title: string | null
  type: string | null
  status: string | null
  currency: string | null
  created_at?: string | null
  group_token?: string | null
  first_viewed_at?: string | null

  po_count?: number | null
  expected_po_count?: number | null
  last_po_at?: string | null
  sale_in_progress_at?: string | null
}

function fmtDate(s?: string | null) {
  if (!s) return 'n/a'
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

function statusLabel(s: string | null | undefined) {
  const v = (s ?? '').toLowerCase().trim()
  if (!v) return 'unknown'
  if (v === 'sale_in_progress') return 'Sale in progress'
  if (v === 'awarded') return 'Awarded'
  if (v === 'open') return 'Open'
  if (v === 'closed') return 'Closed'
  if (v === 'draft') return 'Draft'
  if (v === 'order_processing') return 'Order processing'
  if (v === 'sold') return 'Sold'
  return s ?? 'unknown'
}

function statusRank(s: string | null | undefined) {
  const v = (s ?? '').toLowerCase().trim()
  if (v === 'sale_in_progress') return 0
  if (v === 'order_processing') return 1
  if (v === 'awarded') return 2
  if (v === 'open') return 3
  if (v === 'draft') return 4
  if (v === 'sold') return 8
  if (v === 'closed') return 9
  return 5
}

function isInviteAllowed(status: string | null | undefined) {
  const v = (status ?? '').toLowerCase().trim()
  return v === 'open' || v === 'draft'
}

export default function LotsPage() {
  const router = useRouter()
  const [tenantId, setTenantId] = useState('')
  const [lots, setLots] = useState<LotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'open' | 'sale_in_progress' | 'closed' | 'draft' | 'awarded' | 'order_processing' | 'sold'>(
    'all'
  )
  const palette = ['#f97316', '#0ea5e9', '#a855f7', '#10b981', '#e11d48', '#6366f1', '#14b8a6', '#f59e0b']
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())

  const loadLots = async (tid: string) => {
    setLoading(true)
    setError('')

    const selectColsWithGroup =
      'id,tenant_id,title,type,status,currency,created_at,po_count,expected_po_count,last_po_at,sale_in_progress_at,group_token,first_viewed_at'
    const selectColsNoGroup =
      'id,tenant_id,title,type,status,currency,created_at,po_count,expected_po_count,last_po_at,sale_in_progress_at'

    const tryQuery = async (orderCol: 'created_at' | 'id', withGroup: boolean) => {
      return await supabase
        .from('lots')
        .select(withGroup ? selectColsWithGroup : selectColsNoGroup)
        .eq('tenant_id', tid)
        .order(orderCol, { ascending: false })
    }

    try {
      const { data: d, error: e } = await tryQuery('created_at', true)
      let rows: LotRow[] = []

      if (e) {
        const msg = (e.message || '').toLowerCase()
        if (msg.includes('group_token') && msg.includes('does not exist')) {
          const fbGroup = await tryQuery('created_at', false)
          if (fbGroup.error) throw fbGroup.error
          rows = ((fbGroup.data ?? []) as unknown as LotRow[]) ?? []
          setLots(rows)
          setLoading(false)
          return
        }
        if (msg.includes('created_at') && msg.includes('does not exist')) {
          const fb = await tryQuery('id', true)
          if (fb.error) throw fb.error
          rows = ((fb.data ?? []) as unknown as LotRow[]) ?? []
        } else {
          throw e
        }
      } else {
        rows = ((d ?? []) as unknown as LotRow[]) ?? []
      }

      rows.sort((a, b) => {
        const ra = statusRank(a.status)
        const rb = statusRank(b.status)
        if (ra !== rb) return ra - rb

        const ap = a.last_po_at ? Date.parse(a.last_po_at) : 0
        const bp = b.last_po_at ? Date.parse(b.last_po_at) : 0
        if (ap !== bp) return bp - ap

        const ac = a.created_at ? Date.parse(a.created_at) : 0
        const bc = b.created_at ? Date.parse(b.created_at) : 0
        if (ac !== bc) return bc - ac

        return (b.id ?? '').localeCompare(a.id ?? '')
      })

      setLots(rows)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load lots'
      setError(msg)
      setLots([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        setLoading(true)
        const profile = await ensureProfile()
        if (cancelled) return
        setTenantId(profile.tenant_id)
        // load locally viewed ids (in case DB update is delayed/blocked)
        try {
          const stored = localStorage.getItem('lots_seen')
          if (stored) {
            const arr = JSON.parse(stored)
            if (Array.isArray(arr)) setSeenIds(new Set(arr.filter((x) => typeof x === 'string')))
          }
        } catch {
          /* ignore */
        }
        // parse ?new=... for highlights
        const params = new URLSearchParams(window.location.search)
        const idsParam = params.get('new')
        if (idsParam) {
          const ids = idsParam
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          setNewIds(new Set(ids))
          params.delete('new')
          const next = params.toString()
          const path = next ? `/dashboard/lots?${next}` : '/dashboard/lots'
          router.replace(path)
        }
        await loadLots(profile.tenant_id)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to bootstrap tenant'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [router])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = (v: unknown) => String(v ?? '').toLowerCase().includes(s)

    return lots.filter((l) => {
      if (filter !== 'all') {
        const st = (l.status ?? '').toLowerCase()
        if (st !== filter) return false
      }

      if (!s) return true
      if (hit(l.title) || hit(l.type) || hit(l.status) || hit(l.currency) || hit(l.id)) return true
      return false
    })
  }, [lots, q, filter])

  const wholeLots = useMemo(() => filtered.filter((l) => !l.group_token), [filtered])
  const splitLots = useMemo(() => filtered.filter((l) => !!l.group_token), [filtered])
  const splitGroups = useMemo(() => {
    const m = new Map<string, LotRow[]>()
    for (const l of splitLots) {
      const key = l.group_token as string
      const arr = m.get(key) ?? []
      arr.push(l)
      m.set(key, arr)
    }
    return Array.from(m.entries())
  }, [splitLots])

  const ActionLink = ({
    href,
    children,
    title,
    soft,
  }: {
    href: string
    children: React.ReactNode
    title?: string
    soft?: boolean
  }) => (
    <Link
      href={href}
      title={title}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'var(--text)',
        background: soft ? 'var(--accent-soft)' : 'var(--panel)',
        fontWeight: 900,
        fontSize: 12,
      }}
    >
      {children}
    </Link>
  )

  const markViewed = async (id: string) => {
    setNewIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setSeenIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem('lots_seen', JSON.stringify(Array.from(next)))
      } catch {
        /* ignore */
      }
      return next
    })
    setLots((prev) =>
      prev.map((l) => (l.id === id ? { ...l, first_viewed_at: l.first_viewed_at ?? new Date().toISOString() } : l))
    )
    try {
      await supabase.from('lots').update({ first_viewed_at: new Date().toISOString() }).eq('id', id)
    } catch (e) {
      console.error('markViewed failed', e)
    }
  }

  const renderLotCard = (l: LotRow, accent?: string) => {
    const isNew = newIds.has(l.id) || (!l.first_viewed_at && !seenIds.has(l.id))
    const poCount = Number(l.po_count ?? 0)
    const expected = Number(l.expected_po_count ?? 0)
    const hasExpected = (l.expected_po_count ?? null) !== null
    const st = (l.status ?? '').toLowerCase()
    const isSale = st === 'sale_in_progress'

    const badgeBg =
      st === 'sale_in_progress'
        ? 'var(--text)'
        : st === 'open'
        ? 'var(--accent)'
        : st === 'order_processing'
        ? 'var(--accent-2)'
        : st === 'sold'
        ? '#0b5'
        : st === 'closed'
        ? '#777'
        : '#555'

    const showExpected = hasExpected && expected > 0
    const poText = showExpected ? `PO: ${poCount} / ${expected} received` : poCount > 0 ? `POs: ${poCount}` : ''
    const poComplete = showExpected && poCount >= expected

    return (
      <div
        key={l.id}
        style={{
          border: `1px solid ${accent || (isNew ? 'rgba(16,185,129,0.6)' : 'var(--border)')}`,
          borderRadius: 12,
          padding: 12,
          background: isNew ? 'rgba(16,185,129,0.08)' : 'var(--panel)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 340 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link
                href={l.group_token ? `/dashboard/lots/create-summary?group=${l.group_token}` : `/dashboard/lots/${l.id}`}
                style={{ fontWeight: 950, fontSize: 16, textDecoration: 'none', color: 'var(--text)' }}
                onClick={() => markViewed(l.id)}
              >
                {l.title ?? 'Untitled lot'}
              </Link>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: badgeBg,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                }}
                title={`Status: ${l.status ?? 'unknown'}`}
              >
                {statusLabel(l.status)}
              </span>

              {poText ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: poComplete ? 'rgba(11, 170, 85, 0.12)' : 'rgba(15,23,42,0.04)',
                    color: 'var(--text)',
                    fontSize: 12,
                    fontWeight: 900,
                    border: '1px solid var(--border)',
                  }}
                  title={showExpected ? 'Purchase orders received vs expected (derived from awarded buyers)' : 'Purchase orders received'}
                >
                  {poText}
                  {poComplete ? ' ✓' : ''}
                </span>
              ) : null}
            </div>

            <div style={{ color: 'var(--muted)', marginTop: 6, fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>
                Type: <b style={{ color: 'var(--text)' }}>{l.type ?? '—'}</b>
              </span>
              <span>
                Currency: <b style={{ color: 'var(--text)' }}>{l.currency ?? '—'}</b>
              </span>
              <span>
                Created: <b style={{ color: 'var(--text)' }}>{fmtDate(l.created_at ?? null)}</b>
              </span>
            </div>

            {showExpected ? (
              <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                Expected POs are derived from winners: <b style={{ color: 'var(--text)' }}>{expected}</b>
                {poCount < expected ? <span style={{ marginLeft: 8 }}>({expected - poCount} remaining)</span> : null}
              </div>
            ) : null}
          </div>

          <div style={{ minWidth: 320, textAlign: 'right' }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Last PO: <b style={{ color: 'var(--text)' }}>{fmtDate(l.last_po_at ?? null)}</b>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              Sale started: <b style={{ color: 'var(--text)' }}>{fmtDate(l.sale_in_progress_at ?? null)}</b>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <ActionLink href={`/dashboard/lots/${l.id}/items`}>Items</ActionLink>

              {isInviteAllowed(l.status) ? (
                <ActionLink href={`/dashboard/lots/${l.id}/invite`} soft title="Invite buyers / manage invites">
                  Invite
                </ActionLink>
              ) : null}

              <ActionLink href={`/dashboard/lots/${l.id}/offers`}>Offers</ActionLink>

              <ActionLink href={`/dashboard/lots/${l.id}/financials`} title="Set profit inputs for Analytics">
                Financials
              </ActionLink>
            </div>
          </div>
        </div>

        {poCount > 0 && isSale ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              background: 'rgba(15,23,42,0.02)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              fontSize: 12,
            }}
          >
            • PO received — sale is in progress. Next: confirm PO contents, align logistics and payment, and complete fulfilment.
            {showExpected && expected > poCount ? (
              <span style={{ marginLeft: 8 }}>
                ({expected - poCount} more PO{expected - poCount === 1 ? '' : 's'} expected)
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Lots</h1>
          <div style={{ color: 'var(--muted)' }}>Operational view. Expected POs are derived from awarded buyers.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lots…"
            style={{
              width: 320,
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'var(--panel)',
              color: 'var(--text)',
            }}
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontWeight: 900,
            }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="sale_in_progress">Sale in progress</option>
            <option value="order_processing">Order processing</option>
            <option value="awarded">Awarded</option>
            <option value="draft">Draft</option>
            <option value="sold">Sold</option>
            <option value="closed">Closed</option>
          </select>

          <Link
            href="/dashboard/lots/new"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              textDecoration: 'none',
              color: 'var(--text)',
              fontWeight: 900,
              background: 'var(--panel)',
            }}
          >
            + New lot
          </Link>

          <button
            onClick={() => tenantId && loadLots(tenantId)}
            style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
            disabled={!tenantId || loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}
      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}

      {!loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0' }}>Whole lots</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {wholeLots.map((l) => renderLotCard(l))}
              {wholeLots.length === 0 ? <div style={{ color: 'var(--muted)' }}>No whole lots found.</div> : null}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '8px 0' }}>Split lots</h3>
            {splitGroups.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {splitGroups.map(([groupId, groupLots], idx) => {
                  const color = palette[idx % palette.length]
                  return (
                    <div
                      key={groupId}
                      style={{
                        border: `1px solid ${color}`,
                        borderRadius: 12,
                        padding: 12,
                        background: 'var(--panel)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 900 }}>Batch {idx + 1}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Group of {groupLots.length} OEM sub-lots</div>
                        </div>
                        <Link href={`/dashboard/lots/create-summary?group=${groupId}`} style={{ textDecoration: 'none', color: color, fontWeight: 900 }}>
                          Manage batch
                        </Link>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                        {groupLots.map((lot) => renderLotCard(lot, color))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)' }}>No split lots found.</div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}
