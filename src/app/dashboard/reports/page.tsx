'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Timeframe = 'mtd' | 'last7' | 'last30'

function startIso(tf: Timeframe) {
  const now = new Date()
  const d = new Date(now)
  if (tf === 'mtd') {
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (tf === 'last7') {
    d.setDate(d.getDate() - 7)
    return d.toISOString()
  }
  d.setDate(d.getDate() - 30)
  return d.toISOString()
}

function fmtCsv(v: unknown) {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`
  return s
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0] ?? {})
  const lines: string[] = []
  lines.push(headers.map(fmtCsv).join(','))
  for (const r of rows) {
    lines.push(headers.map((h) => fmtCsv(r[h])).join(','))
  }
  return lines.join('\n')
}

function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
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

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tenantId, setTenantId] = useState<string>('')
  const [timeframe, setTimeframe] = useState<Timeframe>('mtd')
  const since = useMemo(() => startIso(timeframe), [timeframe])

  const [tenantLotIds, setTenantLotIds] = useState<string[]>([])

  const [counts, setCounts] = useState({
    awarded_lines: 0,
    purchase_orders: 0,
    buyers: 0,
  })

  const loadTenantLotIds = useCallback(async (tid: string) => {
    // Lots are the source of truth for tenant scoping.
    const { data, error } = await supabase.from('lots').select('id').eq('tenant_id', tid).limit(20000)
    if (error) throw error
    const ids = ((data as { id?: string }[] | null | undefined) ?? []).map((r) => String(r.id ?? ''))
    setTenantLotIds(ids)
    return ids
  }, [])

  const loadCounts = useCallback(async (tid: string, lotIds: string[]) => {
    const bu = supabase.from('buyers').select('id', { count: 'exact', head: true }).eq('tenant_id', tid)

    // If there are no lots, sales/PO counts are 0.
    if (!lotIds.length) {
      const buRes = await bu
      if (buRes.error) throw buRes.error
      setCounts({ awarded_lines: 0, purchase_orders: 0, buyers: buRes.count ?? 0 })
      return
    }

    // IMPORTANT: scope by lot_id IN (tenant lots), not awarded_lines.tenant_id / purchase_orders.tenant_id
    const aw = supabase
      .from('awarded_lines')
      .select('id', { count: 'exact', head: true })
      .in('lot_id', lotIds)
      .gte('created_at', since)

    const po = supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .in('lot_id', lotIds)
      .gte('created_at', since)

    const [awRes, poRes, buRes] = await Promise.all([aw, po, bu])
    if (awRes.error) throw awRes.error
    if (poRes.error) throw poRes.error
    if (buRes.error) throw buRes.error

    setCounts({
      awarded_lines: awRes.count ?? 0,
      purchase_orders: poRes.count ?? 0,
      buyers: buRes.count ?? 0,
    })
  }, [since])

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError('')
        const profile = await ensureProfile()
        setTenantId(profile.tenant_id)

        const lotIds = await loadTenantLotIds(profile.tenant_id)
        await loadCounts(profile.tenant_id, lotIds)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load reports'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [loadCounts, loadTenantLotIds])

  useEffect(() => {
    if (!tenantId) return
    loadCounts(tenantId, tenantLotIds).catch((e) => {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to refresh counts'
      setError(msg)
    })
  }, [loadCounts, tenantId, tenantLotIds])

  const exportSales = async () => {
    try {
      setError('')
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Not authenticated')

      if (!tenantLotIds.length) {
        alert('No lots found for this tenant, so there is nothing to export.')
        return
      }

      const { data, error } = await supabase
        .from('awarded_lines')
        .select(
          `
          id,created_at,qty,unit_price,extended,currency,round_id,lot_id,
          buyers ( name, company, email ),
          line_items ( model, description ),
          lots ( title )
        `
        )
        .in('lot_id', tenantLotIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000)

      if (error) throw error

      const rows = ((data as Record<string, unknown>[] | null | undefined) ?? []).map((r) => {
        const lots = r.lots as { title?: string } | null | undefined
        const buyers = r.buyers as { company?: string; name?: string; email?: string } | null | undefined
        const lineItems = r.line_items as { model?: string; description?: string } | null | undefined
        return {
          awarded_at: r.created_at ?? '',
          lot_title: lots?.title ?? '',
          lot_id: r.lot_id ?? '',
          round_id: r.round_id ?? '',
          buyer: buyers?.company ? `${buyers.company} — ${buyers.name ?? ''}` : buyers?.name ?? '',
          buyer_email: buyers?.email ?? '',
          item_model: lineItems?.model ?? '',
          item_description: lineItems?.description ?? '',
          qty: r.qty ?? '',
          unit_price: r.unit_price ?? '',
          extended: r.extended ?? '',
          currency: r.currency ?? '',
        }
      })

      const csv = toCsv(rows)
      downloadText(`sales_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Export failed'
      alert(msg)
    }
  }

  const exportPOs = async () => {
    try {
      setError('')
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Not authenticated')

      if (!tenantLotIds.length) {
        alert('No lots found for this tenant, so there is nothing to export.')
        return
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .select(
          `
          id,created_at,file_name,notes,lot_id,buyer_id,
          lots ( title ),
          buyers ( name, company, email )
        `
        )
        .in('lot_id', tenantLotIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20000)

      if (error) throw error

      const rows = ((data as Record<string, unknown>[] | null | undefined) ?? []).map((r) => {
        const lots = r.lots as { title?: string } | null | undefined
        const buyers = r.buyers as { company?: string; name?: string; email?: string } | null | undefined
        return {
          po_at: r.created_at ?? '',
          lot_title: lots?.title ?? '',
          lot_id: r.lot_id ?? '',
          buyer: buyers?.company ? `${buyers.company} — ${buyers.name ?? ''}` : buyers?.name ?? '',
          buyer_email: buyers?.email ?? '',
          file_name: r.file_name ?? '',
          notes: r.notes ?? '',
        }
      })

      const csv = toCsv(rows)
      downloadText(`po_register_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Export failed'
      alert(msg)
    }
  }

  const exportBuyers = async () => {
    try {
      setError('')
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('buyers')
        .select('id,name,email,company,tags,credit_ok,reliability_score,payment_terms,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20000)

      if (error) throw error

      const rows = ((data as Record<string, unknown>[] | null | undefined) ?? []).map((b) => ({
        name: b.name ?? '',
        email: b.email ?? '',
        company: b.company ?? '',
        tags: Array.isArray(b.tags) ? b.tags.join('; ') : '',
        credit_ok: b.credit_ok ?? '',
        reliability_score: b.reliability_score ?? '',
        payment_terms: b.payment_terms ?? '',
        created_at: b.created_at ?? '',
      }))

      const csv = toCsv(rows)
      downloadText(`buyers_${new Date().toISOString().slice(0, 10)}.csv`, csv)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Export failed'
      alert(msg)
    }
  }

  if (loading) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Reports</h1>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  if (error) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Reports</h1>
        <div style={{ color: 'crimson' }}>{error}</div>
      </main>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Reports</h1>
          <div style={{ color: 'var(--muted)' }}>
            Simple exports for ops + finance • Tenant: <b style={{ color: 'var(--text)' }}>{tenantId.slice(0, 8)}…</b>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            Lots in tenant: <b style={{ color: 'var(--text)' }}>{tenantLotIds.length}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Timeframe</div>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
              }}
            >
              <option value="mtd">Month-to-date</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
            </select>
          </div>

          <Link
            href="/dashboard"
            style={{
              textDecoration: 'none',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              color: 'var(--text)',
            }}
          >
            ← Home
          </Link>
        </div>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <Card title="Sales export" subtitle={`Awarded lines since ${new Date(since).toLocaleDateString()}`}>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Rows available: <b style={{ color: 'var(--text)' }}>{counts.awarded_lines}</b>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={exportSales}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                color: '#0a0907',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              Export Sales (CSV)
            </button>
          </div>
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
            Includes buyer, item model/description, qty, unit, extended, currency, lot title.
          </div>
        </Card>

        <Card title="PO register" subtitle={`PO uploads since ${new Date(since).toLocaleDateString()}`}>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Rows available: <b style={{ color: 'var(--text)' }}>{counts.purchase_orders}</b>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={exportPOs}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              Export PO Register (CSV)
            </button>
          </div>
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
            Includes lot title, buyer, file name, created_at, notes.
          </div>
        </Card>

        <Card title="Buyers" subtitle="Master list">
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Buyers: <b style={{ color: 'var(--text)' }}>{counts.buyers}</b>
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={exportBuyers}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              Export Buyers (CSV)
            </button>
          </div>
          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
            Name, email, company, tags, credit metrics, terms.
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14, color: 'var(--muted)', fontSize: 12 }}>
        Note: CSV is the MVP for universal compatibility. If you want XLSX next, we can add it.
      </div>
    </main>
  )
}
