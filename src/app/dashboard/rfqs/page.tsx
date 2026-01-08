"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type RfqListItem = {
  id: string
  subject: string | null
  note: string | null
  status: string
  buyer_tenant_id: string
  buyer_tenant_name: string | null
  requester_name: string | null
  requester_email: string | null
  requester_phone: string | null
  requester_company: string | null
  created_at: string
  line_count: number
  lines: RfqLine[]
}

type RfqLine = {
  id: string
  inventory_item_id: string | null
  qty_requested: number | null
  model: string | null
  description: string | null
  oem: string | null
  qty_available: number | null
  cost: number | null
  currency: string | null
  avg_sale_price: number | null
  last_sale_price: number | null
  last_quote_price: number | null
}

export default function RfqsPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [rfqs, setRfqs] = useState<RfqListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quotedPrices, setQuotedPrices] = useState<Record<string, string>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser()
        if (userErr) throw userErr
        if (!user) throw new Error('Not signed in')

        const { data: profile, error: profileErr } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
        if (profileErr) throw profileErr
        const tenant = profile?.tenant_id
        if (!tenant) throw new Error('Tenant not found')
        setTenantId(tenant)
        await loadRfqs(tenant)
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load RFQs')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const loadRfqs = async (tenant: string) => {
    const { data, error } = await supabase
      .from('rfqs')
      .select(
        'id,subject,note,status,buyer_tenant_id,created_at,rfq_lines(id,inventory_item_id,qty_requested,inventory_items(id,model,description,oem,qty_available,cost,currency)),requester_name,requester_email,requester_phone,requester_company'
      )
      .eq('supplier_tenant_id', tenant)
      .in('status', ['new', 'sent'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const buyerTenantIds = Array.from(new Set((data ?? []).map((r) => String(r.buyer_tenant_id ?? '')).filter(Boolean)))
    const tenantNames =
      buyerTenantIds.length > 0
        ? new Map(
            (
              (await supabase.from('tenants').select('id,name').in('id', buyerTenantIds)).data ?? []
            ).map((t: any) => [String(t.id), t.name as string | null])
          )
        : new Map()
    // collect inventory ids for stats
    const itemIds = new Set<string>()
    ;(data ?? []).forEach((r: any) => {
      ;(r.rfq_lines ?? []).forEach((l: any) => {
        if (l.inventory_item_id) itemIds.add(String(l.inventory_item_id))
      })
    })

    const itemIdList = Array.from(itemIds)
    // Fetch sales/quote history for these items
    const [soRes, quoteRes] = await Promise.all([
      itemIdList.length
        ? supabase
            .from('sales_order_lines')
            .select('inventory_item_id,price,created_at')
            .in('inventory_item_id', itemIdList)
            .order('created_at', { ascending: false })
            .limit(500)
        : { data: [], error: null },
      itemIdList.length
        ? supabase
            .from('quote_lines')
            .select('inventory_item_id,price,created_at')
            .in('inventory_item_id', itemIdList)
            .order('created_at', { ascending: false })
            .limit(500)
        : { data: [], error: null },
    ])
    if (soRes.error) console.error(soRes.error)
    if (quoteRes.error) console.error(quoteRes.error)

    const lastSale = new Map<string, number>()
    const avgSale = new Map<string, number>()
    if (soRes.data) {
      const grouped: Record<string, number[]> = {}
      for (const row of soRes.data as any[]) {
        const id = String(row.inventory_item_id ?? '')
        if (!grouped[id]) grouped[id] = []
        if (row.price != null) grouped[id].push(Number(row.price))
      }
      Object.entries(grouped).forEach(([id, arr]) => {
        if (arr.length) {
          avgSale.set(id, arr.reduce((a, b) => a + b, 0) / arr.length)
          lastSale.set(id, arr[0])
        }
      })
    }

    const lastQuote = new Map<string, number>()
    if (quoteRes.data) {
      const seen = new Set<string>()
      for (const row of quoteRes.data as any[]) {
        const id = String(row.inventory_item_id ?? '')
        if (seen.has(id)) continue
        seen.add(id)
        if (row.price != null) lastQuote.set(id, Number(row.price))
      }
    }

    const mapped: RfqListItem[] =
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        subject: r.subject == null ? null : String(r.subject),
        note: r.note == null ? null : String(r.note),
        status: r.status == null ? 'new' : String(r.status),
        buyer_tenant_id: String(r.buyer_tenant_id ?? ''),
        buyer_tenant_name: tenantNames.get(String(r.buyer_tenant_id ?? '')) ?? null,
        requester_name: r.requester_name == null ? null : String(r.requester_name),
        requester_email: r.requester_email == null ? null : String(r.requester_email),
        requester_phone: r.requester_phone == null ? null : String(r.requester_phone),
        requester_company: r.requester_company == null ? null : String(r.requester_company),
        created_at: r.created_at ? String(r.created_at) : new Date().toISOString(),
        line_count: Array.isArray((r as any).rfq_lines) ? (r as any).rfq_lines.length : 0,
        lines: Array.isArray((r as any).rfq_lines)
          ? (r as any).rfq_lines.map((l: any) => {
              const inv = l.inventory_items || {}
              const invId = l.inventory_item_id ? String(l.inventory_item_id) : null
              return {
                id: String(l.id ?? ''),
                inventory_item_id: invId,
                qty_requested: l.qty_requested == null ? null : Number(l.qty_requested),
                model: inv.model ?? null,
                description: inv.description ?? null,
                oem: inv.oem ?? null,
                qty_available: inv.qty_available == null ? null : Number(inv.qty_available),
                cost: inv.cost == null ? null : Number(inv.cost),
                currency: inv.currency ?? null,
                avg_sale_price: invId ? avgSale.get(invId) ?? null : null,
                last_sale_price: invId ? lastSale.get(invId) ?? null : null,
                last_quote_price: invId ? lastQuote.get(invId) ?? null : null,
              }
            })
          : [],
      })) ?? []
    setRfqs(mapped)
  }

  const markRfqQuoted = async (rfqId: string) => {
    try {
      const { error } = await supabase.from('rfqs').update({ status: 'quoted' }).eq('id', rfqId)
      if (error) throw error
      if (tenantId) await loadRfqs(tenantId)
    } catch (e) {
      console.error('rfq update error', e)
      setError(e instanceof Error ? e.message : 'Failed to update RFQ')
    }
  }

  const onPriceChange = (lineId: string, val: string) => {
    setQuotedPrices((prev) => ({ ...prev, [lineId]: val }))
  }

  const sendQuote = (rfqId: string) => {
    // TODO: integrate with quotes/send API once flow is finalized
    alert('Send Quote (stub) for RFQ ' + rfqId)
  }

  const sendQuoteEmail = (rfqId: string) => {
    // TODO: integrate Outlook mailto/graph send when ready
    alert('Send Quote via email (stub) for RFQ ' + rfqId)
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>RFQs awaiting response</h1>
        <p style={{ color: 'var(--muted)' }}>Respond to incoming RFQs from other organisations.</p>
        <a
          href="/dashboard/quoting"
          style={{
            display: 'inline-block',
            marginTop: 6,
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          ← Back to Quotes
        </a>
      </div>

      {error ? (
        <div style={{ color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: 12, background: 'rgba(178,58,58,0.08)' }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading RFQs…</div>
      ) : rfqs.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No RFQs awaiting response.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rfqs.map((r) => (
            <div
              key={r.id}
              style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel)', display: 'grid', gap: 8 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{r.subject || 'RFQ'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    From: {r.requester_company || r.buyer_tenant_name || r.buyer_tenant_id.slice(0, 8)}{' '}
                    {r.requester_name ? `• ${r.requester_name}` : ''} {r.requester_email ? `• ${r.requester_email}` : ''}{' '}
                    {r.requester_phone ? `• ${r.requester_phone}` : ''} • {new Date(r.created_at).toLocaleString()} • Lines: {r.line_count}
                  </div>
                  {r.note ? <div style={{ marginTop: 6 }}>{r.note}</div> : null}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => markRfqQuoted(r.id)}
                    style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                  >
                    Mark quoted
                  </button>
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.8fr',
                    background: 'var(--surface-2)',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  <div style={{ padding: 8 }}>Part / Description</div>
                  <div style={{ padding: 8 }}>Qty requested</div>
                  <div style={{ padding: 8 }}>In stock</div>
                  <div style={{ padding: 8 }}>Cost</div>
                  <div style={{ padding: 8 }}>Avg sale</div>
                  <div style={{ padding: 8 }}>Last quote</div>
                  <div style={{ padding: 8 }}>Quote price</div>
                </div>
                {r.lines.map((l) => (
                  <div
                    key={l.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.1fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 0.8fr',
                      borderTop: '1px solid var(--border)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ padding: 8 }}>
                      <div style={{ fontWeight: 800 }}>{l.model || l.description || 'Line'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{l.description || ''}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>{l.oem || ''}</div>
                    </div>
                    <div style={{ padding: 8 }}>{l.qty_requested ?? '—'}</div>
                    <div style={{ padding: 8 }}>{l.qty_available ?? '—'}</div>
                    <div style={{ padding: 8 }}>
                      {l.cost ?? '—'} {l.currency ?? ''}
                    </div>
                    <div style={{ padding: 8 }}>
                      {l.avg_sale_price ?? '—'} {l.currency ?? ''}
                    </div>
                    <div style={{ padding: 8 }}>
                      {l.last_quote_price ?? '—'} {l.currency ?? ''}
                    </div>
                    <div style={{ padding: 8 }}>
                      <input
                        type="number"
                        value={quotedPrices[l.id] ?? ''}
                        onChange={(e) => onPriceChange(l.id, e.target.value)}
                        placeholder="Enter price"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => sendQuote(r.id)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', fontWeight: 800 }}
                >
                  Send Quote
                </button>
                <button
                  onClick={() => sendQuoteEmail(r.id)}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', fontWeight: 800 }}
                >
                  Send Quote via Email
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
