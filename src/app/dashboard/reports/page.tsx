'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Timeframe = 'last30' | 'last90'

type RevenueResp = {
  ok: boolean
  summary?: { awarded_gmv: number; offer_gmv: number; lots_awarded: number; award_velocity_days: number | null }
  series?: Array<{ period: string; awarded: number; offers: number }>
  message?: string
}

type PoResp = {
  ok: boolean
  summary?: { pos_total: number; pos_sent: number; pos_open: number; spend: number | null }
  ageing?: Array<{ id: string; age_days: number }>
  message?: string
}

type InvResp = {
  ok: boolean
  summary?: { total_value: number; total_qty: number }
  ageing?: Record<string, number>
  top?: Array<{ id: string; model: string | null; description: string | null; oem: string | null; qty: number; cost: number; value: number }>
  message?: string
}

type ExcResp = {
  ok: boolean
  awards_without_po?: Array<{ id: string; lot_id: string | null; buyer_id: string | null; created_at: string }>
  po_not_sent?: Array<{ id: string; age_days: number }>
  message?: string
}

function startIso(tf: Timeframe) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (tf === 'last90') d.setDate(d.getDate() - 90)
  else d.setDate(d.getDate() - 30)
  return d.toISOString()
}

function fmtCurrency(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—'
  return Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
}

function fmtNumber(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—'
  return Intl.NumberFormat().format(v)
}

export default function ReportsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('last30')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revenue, setRevenue] = useState<RevenueResp | null>(null)
  const [poData, setPoData] = useState<PoResp | null>(null)
  const [invData, setInvData] = useState<InvResp | null>(null)
  const [excData, setExcData] = useState<ExcResp | null>(null)

  const params = useMemo(() => {
    const from = startIso(timeframe)
    const to = new Date().toISOString()
    return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  }, [timeframe])

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError('')
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined

        const [revRes, poRes, invRes, excRes] = await Promise.all([
          fetch(`/api/reports/revenue-gmv?${params}`, { headers }),
          fetch(`/api/reports/po-pipeline?${params}`, { headers }),
          fetch(`/api/reports/inventory?${params}`, { headers }),
          fetch(`/api/reports/exceptions?${params}`, { headers }),
        ])

        const revJson = (await revRes.json()) as RevenueResp
        const poJson = (await poRes.json()) as PoResp
        const invJson = (await invRes.json()) as InvResp
        const excJson = (await excRes.json()) as ExcResp

        setRevenue(revJson)
        setPoData(poJson)
        setInvData(invJson)
        setExcData(excJson)

        if (!revJson.ok || !poJson.ok || !invJson.ok || !excJson.ok) {
          const msg = revJson.message || poJson.message || invJson.message || excJson.message || 'Failed to load reports'
          setError(msg)
        }
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load reports')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [params])

  const awardedSeries = revenue?.series ?? []
  const topInventory = invData?.top ?? []
  const excAwards = excData?.awards_without_po ?? []
  const excPo = excData?.po_not_sent ?? []

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Reports</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Finance & ops overview (tenant scoped)</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Timeframe</label>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            style={{ padding: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
          >
            <option value="last30">Last 30 days</option>
            <option value="last90">Last 90 days</option>
          </select>
        </div>
      </div>

      {error ? <div style={{ color: 'var(--bad)' }}>{error}</div> : null}
      {loading ? <div style={{ color: 'var(--muted)' }}>Loading reports…</div> : null}

      {/* Revenue & GMV */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Revenue & GMV</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          <Kpi title="Awarded GMV" value={fmtCurrency(revenue?.summary?.awarded_gmv)} />
          <Kpi title="Offer GMV" value={fmtCurrency(revenue?.summary?.offer_gmv)} />
          <Kpi title="Lots awarded" value={fmtNumber(revenue?.summary?.lots_awarded)} />
          <Kpi title="Award velocity (days median)" value={fmtNumber(revenue?.summary?.award_velocity_days ?? undefined)} />
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Series (by period)</div>
          {awardedSeries.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>No data in range.</div>
          ) : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 6 }}>Period</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Awarded</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Offers</th>
                </tr>
              </thead>
              <tbody>
                {awardedSeries.map((row) => (
                  <tr key={row.period}>
                    <td style={{ padding: 6 }}>{row.period}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtCurrency(row.awarded)}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtCurrency(row.offers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* PO Pipeline */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>PO Pipeline</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          <Kpi title="POs open" value={fmtNumber(poData?.summary?.pos_open)} />
          <Kpi title="POs sent" value={fmtNumber(poData?.summary?.pos_sent)} />
          <Kpi title="POs total" value={fmtNumber(poData?.summary?.pos_total)} />
          <Kpi title="Spend" value={poData?.summary?.spend == null ? '—' : fmtCurrency(poData.summary.spend)} />
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Ageing (open)</div>
          {poData?.ageing?.length ? (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 6 }}>PO</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Age (days)</th>
                </tr>
              </thead>
              <tbody>
                {poData.ageing.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: 6 }}>{r.id}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{r.age_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>No open POs in range.</div>
          )}
        </div>
      </section>

      {/* Inventory */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Inventory valuation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          <Kpi title="On-hand value (cost)" value={fmtCurrency(invData?.summary?.total_value)} />
          <Kpi title="On-hand qty" value={fmtNumber(invData?.summary?.total_qty)} />
          {invData?.ageing ? (
            <Kpi
              title="Ageing (0-30 / 31-90 / 91-180 / 180+)"
              value={`${fmtNumber(invData.ageing['0-30'])} / ${fmtNumber(invData.ageing['31-90'])} / ${fmtNumber(
                invData.ageing['91-180']
              )} / ${fmtNumber(invData.ageing['180+'])}`}
            />
          ) : null}
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Top items by value</div>
          {topInventory.length ? (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 6 }}>Part</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>OEM</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Cost</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {topInventory.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: 6, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.model || r.description || '—'}</td>
                    <td style={{ padding: 6 }}>{r.oem || '—'}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtNumber(r.qty)}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtCurrency(r.cost)}</td>
                    <td style={{ padding: 6, textAlign: 'right' }}>{fmtCurrency(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>No inventory data.</div>
          )}
        </div>
      </section>

      {/* Exceptions */}
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Exceptions</h2>
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)', display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 800 }}>Awards without PO</div>
          {excAwards.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>None found.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text)', fontSize: 13 }}>
              {excAwards.slice(0, 50).map((r) => (
                <li key={r.id}>
                  Lot {r.lot_id ?? '—'} · Award {r.id} · Buyer {r.buyer_id ?? '—'} · {new Date(r.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
          <div style={{ fontWeight: 800 }}>POs not sent</div>
          {excPo.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>None found.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text)', fontSize: 13 }}>
              {excPo.slice(0, 50).map((r) => (
                <li key={r.id}>
                  PO {r.id} · Age {r.age_days} days
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  )
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel)' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{title}</div>
      <div style={{ fontWeight: 900, fontSize: 18 }}>{value}</div>
    </div>
  )
}
