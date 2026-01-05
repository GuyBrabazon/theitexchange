'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type LotRow = {
  id: string
  title: string | null
  status: string | null
  type: string | null
  currency: string | null
  created_at?: string | null

  lot_invites?: { count: number }[] | null
  offers?: { count: number }[] | null
  awarded_lines?: { count: number }[] | null
  purchase_orders?: { count: number }[] | null
}

type MonthlyMetric = {
  tenant_id: string
  month: string
  lots_created: number
  lots_invited: number
  lots_with_offers: number
  lots_awarded: number
  lots_with_po: number
  awarded_lines: number
  po_uploads: number
  avg_hours_award_to_po: number | null
}

type ActivityItem =
  | { kind: 'PO'; at: string; title: string; lot_id: string; detail: string }
  | { kind: 'Award'; at: string; title: string; lot_id: string; detail: string }
  | { kind: 'Offer'; at: string; title: string; lot_id: string; detail: string }
  | { kind: 'Invite'; at: string; title: string; lot_id: string; detail: string }

function n(v: unknown) {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

function pct(numer: number, denom: number) {
  if (!denom) return '—'
  return `${Math.round((numer / denom) * 100)}%`
}

function fmtHours(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return `${Math.round(v * 10) / 10}h`
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function countFromEmbed(x: { count: number }[] | null | undefined) {
  if (!x || !Array.isArray(x) || x.length === 0) return 0
  return n(x[0]?.count)
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--panel)',
        boxShadow: 'var(--shadow)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
        {subtitle ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>{subtitle}</div> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

function TinyLotList({ lots, empty }: { lots: LotRow[]; empty: string }) {
  if (!lots.length) return <div style={{ color: 'var(--muted)' }}>{empty}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lots.slice(0, 5).map((l) => (
        <div
          key={l.id}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: 10,
            background: 'rgba(15,23,42,0.02)',
          }}
        >
          <div style={{ fontWeight: 950, letterSpacing: -0.1 }}>
            <Link href={`/dashboard/lots/${l.id}`} style={{ textDecoration: 'none' }}>
              {l.title ?? '(Untitled lot)'}
            </Link>
          </div>

          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12 }}>
            Status: <b style={{ color: 'var(--text)' }}>{l.status ?? '—'}</b> • Currency:{' '}
            <b style={{ color: 'var(--text)' }}>{l.currency ?? '—'}</b> • Invites:{' '}
            <b style={{ color: 'var(--text)' }}>{countFromEmbed(l.lot_invites)}</b> • Offers:{' '}
            <b style={{ color: 'var(--text)' }}>{countFromEmbed(l.offers)}</b>
          </div>

          {/* Deep links */}
          <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href={`/dashboard/lots/${l.id}`}
              style={{
                textDecoration: 'none',
                fontWeight: 900,
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
              }}
            >
              Overview
            </Link>

            <Link
              href={`/dashboard/lots/${l.id}/invite`}
              style={{
                textDecoration: 'none',
                fontWeight: 900,
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--accent-soft)',
              }}
            >
              Invite
            </Link>

            <Link
              href={`/dashboard/lots/${l.id}/offers`}
              style={{
                textDecoration: 'none',
                fontWeight: 900,
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
              }}
            >
              Offers
            </Link>

            <Link
              href={`/dashboard/lots/${l.id}/items`}
              style={{
                textDecoration: 'none',
                fontWeight: 900,
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
              }}
            >
              Items
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  open: boolean
  title: string
  subtitle?: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    // lock scroll
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        // click outside closes
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,6,23,0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          maxHeight: 'min(80vh, 720px)',
          overflow: 'hidden',
          borderRadius: 'var(--r-lg)',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          boxShadow: '0 30px 90px rgba(2,6,23,0.45)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
              {subtitle ? <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{subtitle}</div> : null}
            </div>

            <button
              onClick={onClose}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
                cursor: 'pointer',
              }}
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: 14, overflow: 'auto' }}>{children}</div>

        {footer ? (
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function DashboardHomePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tenantId, setTenantId] = useState<string>('')

  const [lots, setLots] = useState<LotRow[]>([])
  const [metrics, setMetrics] = useState<MonthlyMetric[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])

  // Step 1 additions:
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityAll48h, setActivityAll48h] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string>('')

  const loadActivity48h = async (tid: string) => {
    setActivityLoading(true)
    setActivityError('')
    try {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

      const poQ = supabase
        .from('purchase_orders')
        .select('id,lot_id,buyer_id,created_at, lots(title)')
        .eq('tenant_id', tid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)

      const awQ = supabase
        .from('awarded_lines')
        .select('id,lot_id,buyer_id,created_at, lots(title)')
        .eq('tenant_id', tid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)

      const ofQ = supabase
        .from('offers')
        .select('id,lot_id,buyer_id,created_at,status, lots(title)')
        .eq('tenant_id', tid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)

      const ivQ = supabase
        .from('lot_invites')
        .select('id,lot_id,buyer_id,created_at,status, lots(title)')
        .eq('tenant_id', tid)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)

      const [poRes, awRes, ofRes, ivRes] = await Promise.all([poQ, awQ, ofQ, ivQ])

      const items: ActivityItem[] = []

      for (const r of (poRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'PO',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: 'PO uploaded',
        })
      }

      for (const r of (awRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'Award',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: 'Line awarded',
        })
      }

      for (const r of (ofRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'Offer',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: `Offer submitted${r.status ? ` (${String(r.status)})` : ''}`,
        })
      }

      for (const r of (ivRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'Invite',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: `Invite created${r.status ? ` (${String(r.status)})` : ''}`,
        })
      }

      items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      setActivityAll48h(items)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load activity'
      setActivityError(msg)
      setActivityAll48h([])
    } finally {
      setActivityLoading(false)
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)

      // Lots snapshot with embedded counts
      const { data: lotData, error: lotErr } = await supabase
        .from('lots')
        .select(
          `
          id,title,status,type,currency,created_at,
          lot_invites(count),
          offers(count),
          awarded_lines(count),
          purchase_orders(count)
        `
        )
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(80)

      if (lotErr) throw lotErr
      setLots((lotData as LotRow[]) ?? [])

      // Monthly metrics (last 3 months)
      const { data: mData, error: mErr } = await supabase
        .from('broker_metrics_monthly')
        .select(
          'tenant_id,month,lots_created,lots_invited,lots_with_offers,lots_awarded,lots_with_po,awarded_lines,po_uploads,avg_hours_award_to_po'
        )
        .eq('tenant_id', profile.tenant_id)
        .order('month', { ascending: false })
        .limit(3)

      if (mErr) throw mErr
      setMetrics((mData as MonthlyMetric[]) ?? [])

      // Activity feed (build in app)
      const poQ = supabase
        .from('purchase_orders')
        .select('id,lot_id,buyer_id,created_at, lots(title)')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(30)

      const awQ = supabase
        .from('awarded_lines')
        .select('id,lot_id,buyer_id,created_at, lots(title)')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(30)

      const ofQ = supabase
        .from('offers')
        .select('id,lot_id,buyer_id,created_at,status, lots(title)')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(30)

      const ivQ = supabase
        .from('lot_invites')
        .select('id,lot_id,buyer_id,created_at,status, lots(title)')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(30)

      const [poRes, awRes, ofRes, ivRes] = await Promise.all([poQ, awQ, ofQ, ivQ])

      const items: ActivityItem[] = []

      for (const r of (poRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'PO',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: 'PO uploaded',
        })
      }

      for (const r of (awRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'Award',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: 'Line awarded',
        })
      }

      for (const r of (ofRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'Offer',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: `Offer submitted${r.status ? ` (${String(r.status)})` : ''}`,
        })
      }

      for (const r of (ivRes.data as Record<string, unknown>[] | null | undefined) ?? []) {
        items.push({
          kind: 'Invite',
          at: String(r.created_at ?? ''),
          lot_id: String(r.lot_id ?? ''),
          title: (r.lots as { title?: string } | null | undefined)?.title ?? '(Lot)',
          detail: `Invite created${r.status ? ` (${String(r.status)})` : ''}`,
        })
      }

      items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

      // Step 1 requirement: limit Recent Activity to most recent 10 events.
      setActivity(items.slice(0, 10))
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load dashboard'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const queues = useMemo(() => {
    const byNewest = (a: LotRow, b: LotRow) => Date.parse(String(b.created_at ?? '')) - Date.parse(String(a.created_at ?? ''))

    const needsInvites = lots
      .filter((l) => {
        const inv = countFromEmbed(l.lot_invites)
        const st = (l.status ?? '').toLowerCase()
        return inv === 0 && (st === 'draft' || st === 'open' || st === '')
      })
      .sort(byNewest)

    const waitingReview = lots
      .filter((l) => {
        const offersCount = countFromEmbed(l.offers)
        const awardsCount = countFromEmbed(l.awarded_lines)
        return offersCount > 0 && awardsCount === 0
      })
      .sort(byNewest)

    const waitingPo = lots
      .filter((l) => {
        const awardsCount = countFromEmbed(l.awarded_lines)
        const poCount = countFromEmbed(l.purchase_orders)
        return awardsCount > 0 && poCount === 0
      })
      .sort(byNewest)

    const saleInProgress = lots.filter((l) => (l.status ?? '').toLowerCase() === 'sale_in_progress').sort(byNewest)

    return { needsInvites, waitingReview, waitingPo, saleInProgress }
  }, [lots])

  const kpi = useMemo(() => {
    const sum = (k: keyof MonthlyMetric) => metrics.reduce((acc, r) => acc + n(r[k]), 0)

    const lotsInvited = sum('lots_invited')
    const lotsWithOffers = sum('lots_with_offers')
    const lotsAwarded = sum('lots_awarded')
    const lotsWithPo = sum('lots_with_po')

    let hoursSum = 0
    let w = 0
    for (const r of metrics) {
      if (r.avg_hours_award_to_po !== null && r.avg_hours_award_to_po !== undefined) {
        const ww = n(r.lots_with_po) || 1
        hoursSum += Number(r.avg_hours_award_to_po) * ww
        w += ww
      }
    }
    const avgHours = w ? hoursSum / w : null

    return {
      offerRate: lotsInvited ? lotsWithOffers / lotsInvited : null,
      awardRate: lotsWithOffers ? lotsAwarded / lotsWithOffers : null,
      poRate: lotsAwarded ? lotsWithPo / lotsAwarded : null,
      lotsInvited,
      lotsWithOffers,
      lotsAwarded,
      lotsWithPo,
      avgHours,
    }
  }, [metrics])

  if (loading) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Home</h1>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  if (error) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Home</h1>
        <div style={{ color: 'crimson' }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={load} style={{ padding: 10, borderRadius: 'var(--r-md)' }}>
            Retry
          </button>
        </div>
      </main>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Home</h1>
          <div style={{ color: 'var(--muted)' }}>
            Broker command center • Tenant: <b style={{ color: 'var(--text)' }}>{tenantId.slice(0, 8)}…</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            href="/dashboard/lots/new"
            style={{
              textDecoration: 'none',
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              color: '#fff',
              fontWeight: 950,
              boxShadow: '0 10px 24px rgba(59, 130, 246, 0.22)',
            }}
          >
            + New Lot
          </Link>

          <Link
            href="/dashboard/analytics"
            style={{
              textDecoration: 'none',
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontWeight: 900,
              boxShadow: '0 6px 16px rgba(2, 6, 23, 0.06)',
            }}
          >
            Analytics →
          </Link>

          <button
            onClick={load}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 850,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <Card title="Offer rate (rolling)" subtitle="Lots with offers / lots invited">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{kpi.offerRate === null ? '—' : pct(kpi.lotsWithOffers, kpi.lotsInvited)}</div>
          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            {kpi.lotsWithOffers} / {kpi.lotsInvited} lots
          </div>
        </Card>

        <Card title="Award rate (rolling)" subtitle="Lots awarded / lots with offers">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{kpi.awardRate === null ? '—' : pct(kpi.lotsAwarded, kpi.lotsWithOffers)}</div>
          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            {kpi.lotsAwarded} / {kpi.lotsWithOffers} lots
          </div>
        </Card>

        <Card title="PO rate (rolling)" subtitle="Lots with PO / lots awarded">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{kpi.poRate === null ? '—' : pct(kpi.lotsWithPo, kpi.lotsAwarded)}</div>
          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            {kpi.lotsWithPo} / {kpi.lotsAwarded} lots
          </div>
        </Card>

        <Card title="Avg time award → PO" subtitle="Weighted by PO lots">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{fmtHours(kpi.avgHours)}</div>
          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>Rolling last ~3 months</div>
        </Card>
      </div>

      {/* Main grid */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Needs attention */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="Needs attention" subtitle="Your daily queue">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 950 }}>Needs invites</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{queues.needsInvites.length}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <TinyLotList lots={queues.needsInvites} empty="All good — no lots waiting for invites." />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 950 }}>Offers to review</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{queues.waitingReview.length}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <TinyLotList lots={queues.waitingReview} empty="No lots waiting on offer review." />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 950 }}>Awaiting PO</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{queues.waitingPo.length}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <TinyLotList lots={queues.waitingPo} empty="No awarded lots are awaiting a PO." />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 950 }}>Sale in progress</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{queues.saleInProgress.length}</div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <TinyLotList lots={queues.saleInProgress} empty="No lots in sale_in_progress." />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Quick actions">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/dashboard/lots/new"
                style={{
                  textDecoration: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                  color: '#fff',
                  fontWeight: 950,
                }}
              >
                + New Lot
              </Link>

              <Link
                href="/dashboard/lots/new/import"
                style={{
                  textDecoration: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                }}
              >
                Import Lot
              </Link>

              <Link
                href="/dashboard/buyers/import"
                style={{
                  textDecoration: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                }}
              >
                Import Buyers
              </Link>

              <Link
                href="/dashboard/buyers"
                style={{
                  textDecoration: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                }}
              >
                Manage Buyers
              </Link>

              <Link
                href="/dashboard/analytics"
                style={{
                  textDecoration: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                }}
              >
                Analytics
              </Link>
            </div>
          </Card>
        </div>

        {/* Activity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card
            title="Recent activity"
            subtitle="Most recent 10 events"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                Tip: hit <b style={{ color: 'var(--text)' }}>View all</b> for the last 48 hours.
              </div>
              <button
                onClick={async () => {
                  setActivityOpen(true)
                  if (tenantId) await loadActivity48h(tenantId)
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                View all (48h)
              </button>
            </div>

            {activity.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activity.map((a, idx) => (
                  <div
                    key={`${a.kind}-${a.at}-${idx}`}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      padding: 10,
                      background: 'rgba(15,23,42,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                      <div style={{ fontWeight: 950, letterSpacing: -0.1 }}>
                        <Link href={`/dashboard/lots/${a.lot_id}`} style={{ textDecoration: 'none' }}>
                          {a.title}
                        </Link>
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(a.at)}</div>
                    </div>

                    <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                      <b style={{ color: 'var(--text)' }}>{a.kind}</b> • {a.detail}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)' }}>No activity yet. Create a lot and invite buyers to start the flow.</div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal: all activity over last 48 hours */}
      <Modal
        open={activityOpen}
        title="All activity (last 48 hours)"
        subtitle="Each event links to the lot"
        onClose={() => setActivityOpen(false)}
        footer={
          <>
            <button
              onClick={() => setActivityOpen(false)}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </>
        }
      >
        {activityError ? <div style={{ color: 'crimson', marginBottom: 10 }}>{activityError}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Showing events from the last <b style={{ color: 'var(--text)' }}>48 hours</b>.
          </div>

          <button
            onClick={() => tenantId && loadActivity48h(tenantId)}
            disabled={!tenantId || activityLoading}
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {activityLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {activityLoading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : null}

        {!activityLoading && !activityAll48h.length ? (
          <div style={{ color: 'var(--muted)' }}>No activity in the last 48 hours.</div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activityAll48h.map((a, idx) => (
            <div
              key={`${a.kind}-${a.at}-${idx}`}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: 10,
                background: 'rgba(15,23,42,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <div style={{ fontWeight: 950, letterSpacing: -0.1 }}>
                  <Link href={`/dashboard/lots/${a.lot_id}`} style={{ textDecoration: 'none' }}>
                    {a.title}
                  </Link>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(a.at)}</div>
              </div>

              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                <b style={{ color: 'var(--text)' }}>{a.kind}</b> • {a.detail}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </main>
  )
}
