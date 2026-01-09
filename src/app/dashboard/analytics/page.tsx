'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Timeframe = 'mtd' | 'last7' | 'last30'

type Lot = {
  id: string
  tenant_id: string
  title: string | null
  status: string | null
  currency: string | null
  created_at: string | null
}

type AwardedLine = {
  id: string
  tenant_id: string
  lot_id: string
  line_item_id: string
  extended: number | null
  currency: string | null
  created_at: string | null
}

type LineItem = {
  id: string
  lot_id: string
  created_at?: string | null
}

type LotFinancial = {
  lot_id: string

  // these may or may not exist depending on your schema — we handle missing gracefully
  cost_known_total?: number | null
  asking_price_total?: number | null
  target_margin_pct?: number | null
  currency?: string | null
}

type LotAgg = {
  lot_id: string
  title: string
  currency: string
  awarded_revenue: number
  awarded_lines: number
  distinct_awarded_items: number
  total_items: number
  sold: boolean
  leftovers: boolean

  // profit
  cost_basis: 'known_cost' | 'known_asking' | 'estimated'
  estimated_cost: number
  estimated_profit: number
  margin_pct_on_sale: number
}

function n(v: unknown) {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

function money(v: number, currency: string) {
  const rounded = Math.round(v * 100) / 100
  return `${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function startDateFor(tf: Timeframe, now: Date) {
  if (tf === 'mtd') return startOfMonth(now)
  if (tf === 'last7') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
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
        <div>
          <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
          {subtitle ? <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}

async function loadFinancialsSafe(tenantId: string, lotIds: string[]): Promise<Map<string, LotFinancial>> {
  const map = new Map<string, LotFinancial>()
  if (!lotIds.length) return map

  // Try richer schema first (cost + asking + margin + currency)
  const trySelect = async (cols: string) => {
    const { data, error } = await supabase
      .from('lot_financials')
      .select(cols)
      .eq('tenant_id', tenantId)
      .in('lot_id', lotIds)

    if (error) throw error
    return (data ?? []) as Partial<LotFinancial & { lot_id: string }>[]
  }

  try {
    const rows = await trySelect('lot_id,cost_known_total,asking_price_total,target_margin_pct,currency')
    for (const r of rows) {
      if (!r.lot_id) continue
      const lotId = String(r.lot_id)
      map.set(lotId, {
        lot_id: lotId,
        cost_known_total: r.cost_known_total,
        asking_price_total: r.asking_price_total,
        target_margin_pct: r.target_margin_pct,
        currency: r.currency,
      })
    }
    return map
  } catch (e1: unknown) {
    const fallbackErr = e1 instanceof Error ? e1.message : String(e1)
    console.warn('lot_financials rich select failed, falling back:', fallbackErr)
    try {
      const rows = await trySelect('lot_id,cost_known_total,asking_price_total')
      for (const r of rows) {
        if (!r.lot_id) continue
        const lotId = String(r.lot_id)
        map.set(lotId, {
          lot_id: lotId,
          cost_known_total: r.cost_known_total,
          asking_price_total: r.asking_price_total,
        })
      }
      return map
    } catch (e2: unknown) {
      // If table doesn't exist or schema differs, just return empty
      const msg = e2 instanceof Error ? e2.message : String(e2)
      console.warn('lot_financials load failed (safe fallback):', msg)
      return map
    }
  }
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [tenantId, setTenantId] = useState('')
  const [timeframe, setTimeframe] = useState<Timeframe>('mtd')

  const [lots, setLots] = useState<Lot[]>([])
  const [awardedLines, setAwardedLines] = useState<AwardedLine[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [financials, setFinancials] = useState<Map<string, LotFinancial>>(new Map())
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, number>>({})
  const [quotesSent, setQuotesSent] = useState(0)
  const [quotesWon, setQuotesWon] = useState(0)

  const now = useMemo(() => new Date(), [])
  const startDate = useMemo(() => startDateFor(timeframe, now), [timeframe, now])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)

      const startIso = startDate.toISOString()

      // Lots (for titles/currency/status). Keep it generous.
      const { data: lotData, error: lotErr } = await supabase
        .from('lots')
        .select('id,tenant_id,title,status,currency,created_at')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(500)

      if (lotErr) throw lotErr
      const lotRows = (lotData as Lot[]) ?? []
      setLots(lotRows)

      // Awarded lines in timeframe = main driver for “Profit”, “Lots sold”, “Leftovers”
      const { data: awData, error: awErr } = await supabase
        .from('awarded_lines')
        .select('id,tenant_id,lot_id,line_item_id,extended,currency,created_at')
        .eq('tenant_id', profile.tenant_id)
        .gte('created_at', startIso)
        .order('created_at', { ascending: false })
        .limit(50000)

      if (awErr) throw awErr
      const awRows = (awData as AwardedLine[]) ?? []
      setAwardedLines(awRows)

      // Load line items for the lots that matter (sold vs leftovers needs totals)
      // We’ll derive “lots in scope” from awarded lots in timeframe; if none, fallback to all lots.
      const awardedLotIds = Array.from(new Set(awRows.map((r) => r.lot_id).filter(Boolean)))
      const lotIdsForCounts = awardedLotIds.length ? awardedLotIds : lotRows.map((l) => l.id)

      // Line items (count per lot)
      // Note: if your table is huge, we can optimize later with an RPC/view.
      const { data: liData, error: liErr } = await supabase
        .from('line_items')
        .select('id,lot_id')
        .in('lot_id', lotIdsForCounts)
        .limit(200000)

      if (liErr) throw liErr
      const liRows = (liData as LineItem[]) ?? []
      setLineItems(liRows)

      // Financials (for profit inputs) — safe loader handles schema drift.
      const finMap = await loadFinancialsSafe(profile.tenant_id, lotIdsForCounts)
      setFinancials(finMap)

      // Inventory status counts
      try {
        const { data: invData, error: invErr } = await supabase
          .from('inventory_items')
          .select('status')
          .eq('tenant_id', profile.tenant_id)
          .limit(5000)
        if (invErr) throw invErr
        const counts: Record<string, number> = {}
        for (const row of invData ?? []) {
          const status = (row as { status: string | null }).status?.toLowerCase() ?? 'available'
          counts[status] = (counts[status] ?? 0) + 1
        }
        setInventoryCounts(counts)
      } catch (invErr) {
        console.warn('inventory stats load failed', invErr)
      }

      // Quotes (win rate)
      try {
        const { data: quoteData, error: quoteErr } = await supabase
          .from('quotes')
          .select('status,created_at')
          .eq('tenant_id', profile.tenant_id)
          .gte('created_at', startIso)
          .limit(5000)
        if (quoteErr) throw quoteErr
        const sentCount = quoteData?.length ?? 0
        const winCount =
          quoteData?.filter((q) => {
            const status = String((q as { status?: string }).status ?? '').toLowerCase()
            return status === 'ordered' || status === 'accepted'
          }).length ?? 0
        setQuotesSent(sentCount)
        setQuotesWon(winCount)
      } catch (qErr) {
        console.warn('quotes load failed', qErr)
        setQuotesSent(0)
        setQuotesWon(0)
      }
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load analytics'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [startDate])

  useEffect(() => {
    load()
  }, [load])

  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l] as const)), [lots])

  const lineItemCountByLot = useMemo(() => {
    const m = new Map<string, number>()
    for (const li of lineItems) {
      m.set(li.lot_id, (m.get(li.lot_id) ?? 0) + 1)
    }
    return m
  }, [lineItems])

  const aggByLot = useMemo<LotAgg[]>(() => {
    // aggregate awards by lot
    const tmp = new Map<
      string,
      {
        revenue: number
        lines: number
        itemsSet: Set<string>
        currency: string
      }
    >()

    for (const a of awardedLines) {
      const lotId = a.lot_id
      if (!lotId) continue
      const lot = lotById.get(lotId)
      const currency = (a.currency ?? lot?.currency ?? 'USD') as string

      const cur = tmp.get(lotId) ?? { revenue: 0, lines: 0, itemsSet: new Set<string>(), currency }
      cur.revenue += n(a.extended)
      cur.lines += 1
      if (a.line_item_id) cur.itemsSet.add(a.line_item_id)
      // keep currency stable
      cur.currency = currency
      tmp.set(lotId, cur)
    }

    const rows: LotAgg[] = []

    for (const [lotId, v] of tmp.entries()) {
      const lot = lotById.get(lotId)
      const title = lot?.title ?? '(Untitled lot)'
      const currency = (lot?.currency ?? v.currency ?? 'USD') as string

      const totalItems = n(lineItemCountByLot.get(lotId) ?? 0)
      const distinctAwarded = v.itemsSet.size

      const sold = totalItems > 0 && distinctAwarded >= totalItems
      const leftovers = totalItems > 0 && distinctAwarded > 0 && distinctAwarded < totalItems

      // --- Profit estimation logic (safe + transparent) ---
      const fin = financials.get(lotId)
      const revenue = v.revenue

      // default target margin on sale = 20% (midpoint of 15–25)
      const targetMarginPct = fin?.target_margin_pct != null ? n(fin?.target_margin_pct) : 20
      const marginPctOnSale = clamp(targetMarginPct, 0, 60) // keep sane

      let cost_basis: LotAgg['cost_basis'] = 'estimated'
      let estimated_cost = revenue * (1 - marginPctOnSale / 100)

      if (fin?.cost_known_total != null && Number.isFinite(Number(fin.cost_known_total))) {
        cost_basis = 'known_cost'
        estimated_cost = n(fin.cost_known_total)
      } else if (fin?.asking_price_total != null && Number.isFinite(Number(fin.asking_price_total))) {
        cost_basis = 'known_asking'
        estimated_cost = n(fin.asking_price_total)
      }

      const estimated_profit = revenue - estimated_cost

      rows.push({
        lot_id: lotId,
        title,
        currency,
        awarded_revenue: revenue,
        awarded_lines: v.lines,
        distinct_awarded_items: distinctAwarded,
        total_items: totalItems,
        sold,
        leftovers,
        cost_basis,
        estimated_cost,
        estimated_profit,
        margin_pct_on_sale: marginPctOnSale,
      })
    }

    // most relevant first
    rows.sort((a, b) => b.awarded_revenue - a.awarded_revenue)
    return rows
  }, [awardedLines, lotById, lineItemCountByLot, financials])

  const totals = useMemo(() => {
    let revenue = 0
    let profit = 0
    let knownCostProfit = 0
    let knownAskingProfit = 0
    let estimatedProfit = 0

    let soldLots = 0
    let leftoverLots = 0

    for (const r of aggByLot) {
      revenue += r.awarded_revenue
      profit += r.estimated_profit
      if (r.sold) soldLots += 1
      if (r.leftovers) leftoverLots += 1

      if (r.cost_basis === 'known_cost') knownCostProfit += r.estimated_profit
      else if (r.cost_basis === 'known_asking') knownAskingProfit += r.estimated_profit
      else estimatedProfit += r.estimated_profit
    }

    return {
      revenue,
      profit,
      knownCostProfit,
      knownAskingProfit,
      estimatedProfit,
      soldLots,
      leftoverLots,
      lotsWithAwards: aggByLot.length,
    }
  }, [aggByLot])

  const timeframeLabel = useMemo(() => {
    if (timeframe === 'mtd') return 'Month-to-date'
    if (timeframe === 'last7') return 'Last 7 days'
    return 'Last 30 days'
  }, [timeframe])

  const inventoryStatusDefs = useMemo(
    () => [
      { key: 'available', label: 'Available', color: 'var(--good)' },
      { key: 'reserved', label: 'Reserved', color: 'var(--warn)' },
      { key: 'auction', label: 'Auction', color: 'var(--accent)' },
      { key: 'allocated', label: 'Allocated', color: 'var(--info)' },
      { key: 'sold', label: 'Sold', color: 'var(--bad)' },
    ],
    []
  )

  if (loading) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Analytics</h1>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  if (error) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>Analytics</h1>
        <div style={{ color: 'crimson' }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={load} style={{ padding: 10, borderRadius: 'var(--r-md)' }}>
            Retry
          </button>
        </div>
      </main>
    )
  }

  const currencyHint = lots.find((l) => l.currency)?.currency ?? 'USD'

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Analytics</h1>
          <div style={{ color: 'var(--muted)' }}>
            {timeframeLabel} • Tenant: <b style={{ color: 'var(--text)' }}>{tenantId.slice(0, 8)}</b>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
            }}
          >
            <option value="mtd">Month-to-date</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
          </select>

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

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {inventoryStatusDefs.map((s) => (
          <div
            key={s.key}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: 12,
              background: 'var(--panel)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 900 }}>{s.label}</div>
            <div style={{ height: 4, borderRadius: 4, background: s.color }} />
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{inventoryCounts[s.key] ?? 0} items</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Card title="Profit (estimated)" subtitle="Based on lot_financials: cost known / asking known / estimated @ target margin">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{money(totals.profit, currencyHint)}</div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
            Known cost: <b style={{ color: 'var(--text)' }}>{money(totals.knownCostProfit, currencyHint)}</b> • Known asking:{' '}
            <b style={{ color: 'var(--text)' }}>{money(totals.knownAskingProfit, currencyHint)}</b> • Estimated:{' '}
            <b style={{ color: 'var(--text)' }}>{money(totals.estimatedProfit, currencyHint)}</b>
          </div>
        </Card>

        <Card title="Revenue (awarded)" subtitle="Sum of awarded line extended totals in timeframe">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{money(totals.revenue, currencyHint)}</div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
            Lots with awards: <b style={{ color: 'var(--text)' }}>{totals.lotsWithAwards}</b>
          </div>
        </Card>

        <Card title="Lots sold" subtitle="All line items awarded (in that lot)">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{totals.soldLots}</div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
            Measured as: awarded distinct items = total items
          </div>
        </Card>

        <Card title="Lots with leftovers" subtitle="Some items awarded, some not">
          <div style={{ fontSize: 24, fontWeight: 950 }}>{totals.leftoverLots}</div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
            Measured as: 0 &lt; awarded distinct items &lt; total items
          </div>
        </Card>

        <Card title="Quotes / Converted" subtitle="Quotes in timeframe">
          <div style={{ fontSize: 24, fontWeight: 950 }}>
            {quotesWon} / {quotesSent}
          </div>
          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
            Win rate:{' '}
            <b style={{ color: 'var(--text)' }}>{quotesSent ? Math.round((quotesWon / quotesSent) * 100) : 0}%</b>
          </div>
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card
          title="Lots contributing to this timeframe"
          subtitle="Awarded lots in timeframe, with sold/leftovers + profit basis"
          right={
            <Link
              href="/dashboard/lots"
              style={{
                textDecoration: 'none',
                padding: '8px 10px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
              }}
            >
              View lots ?
            </Link>
          }
        >
          {aggByLot.length === 0 ? (
            <div style={{ color: 'var(--muted)' }}>No awarded lines in this timeframe yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aggByLot.slice(0, 30).map((r) => {
                const badgeBg = r.sold ? 'var(--accent-soft)' : r.leftovers ? 'rgba(2,6,23,0.05)' : 'rgba(2,6,23,0.03)'
                const badgeText = r.sold ? 'Sold' : r.leftovers ? 'Leftovers' : 'Awarded'
                const basisText =
                  r.cost_basis === 'known_cost'
                    ? 'Profit basis: known cost'
                    : r.cost_basis === 'known_asking'
                      ? 'Profit basis: known asking'
                      : `Profit basis: estimated @ ${Math.round(r.margin_pct_on_sale)}% margin`

                return (
                  <div
                    key={r.lot_id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      padding: 12,
                      background: 'rgba(15,23,42,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 950, letterSpacing: -0.1 }}>
                        <Link href={`/dashboard/lots/${r.lot_id}`} style={{ textDecoration: 'none' }}>
                          {r.title}
                        </Link>
                      </div>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: '1px solid var(--border)',
                          background: badgeBg,
                          fontWeight: 950,
                          fontSize: 12,
                        }}
                        title={basisText}
                      >
                        {badgeText}
                      </span>
                    </div>

                    <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 12 }}>
                      <span>
                        Revenue: <b style={{ color: 'var(--text)' }}>{money(r.awarded_revenue, r.currency)}</b>
                      </span>
                      <span>
                        Profit: <b style={{ color: 'var(--text)' }}>{money(r.estimated_profit, r.currency)}</b>
                      </span>
                      <span>
                        Items awarded: <b style={{ color: 'var(--text)' }}>{r.distinct_awarded_items}</b> /{' '}
                        <b style={{ color: 'var(--text)' }}>{r.total_items || '—'}</b>
                      </span>
                      <span>
                        Awarded lines: <b style={{ color: 'var(--text)' }}>{r.awarded_lines}</b>
                      </span>
                      <span title={basisText}>
                        Basis: <b style={{ color: 'var(--text)' }}>{r.cost_basis}</b>
                      </span>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Link
                        href={`/dashboard/lots/${r.lot_id}`}
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
                        href={`/dashboard/lots/${r.lot_id}/offers`}
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
                        href={`/dashboard/lots/${r.lot_id}/financials`}
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
                        Financials
                      </Link>
                    </div>
                  </div>
                )
              })}

              {aggByLot.length > 30 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Showing top 30 by awarded revenue…</div>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </main>
  )
}
