'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type QuoteItem = {
  id: string
  model: string | null
  description: string | null
  oem: string | null
  qty_available: number | null
  currency: string | null
  cost: number | null
}

type Buyer = { id: string; name: string | null; email: string | null; company: string | null }

type QuoteHistory = {
  created_at: string
  buyer_name?: string | null
  buyer_email?: string | null
  price?: number | null
  qty?: number | null
  subject?: string | null
}

const money = (v: number | null | undefined, currency = 'USD') =>
  v == null ? '—' : Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v)

export default function QuotingPage() {
  const [tenantId, setTenantId] = useState<string>('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [selectedBuyer, setSelectedBuyer] = useState<string>('')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<Record<string, { qty: string; price: string }>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [history, setHistory] = useState<Record<string, QuoteHistory[]>>({})
  const [userId, setUserId] = useState<string>('')
  const [quotes, setQuotes] = useState<
    { id: string; buyer: Buyer | null; subject: string | null; status: string; created_at: string; sent_at: string | null }[]
  >([])
  const [quoteFilterBuyer, setQuoteFilterBuyer] = useState<string>('')
  const [quoteFilterText, setQuoteFilterText] = useState<string>('')
  const [quoteStart, setQuoteStart] = useState<string>('')
  const [quoteEnd, setQuoteEnd] = useState<string>('')

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        const user = userRes.user
        if (!user) throw new Error('Not signed in')
        setUserId(user.id)

        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .maybeSingle()
        if (profileErr) throw profileErr
        const tenantId = profile?.tenant_id
        if (!tenantId) throw new Error('Tenant not found')
        setTenantId(tenantId)

        const [{ data: itemsData, error: itemsErr }, { data: buyersData, error: buyersErr }] = await Promise.all([
          supabase
            .from('inventory_items')
            .select('id,model,description,oem,qty_available,currency,cost')
            .eq('tenant_id', tenantId)
            .in('status', ['available', 'reserved', 'auction', 'flip'])
            .order('created_at', { ascending: false })
            .limit(500),
          supabase.from('buyers').select('id,name,email,company').eq('tenant_id', tenantId).order('name', { ascending: true }),
        ])
        if (itemsErr) throw itemsErr
        if (buyersErr) throw buyersErr

        setItems(
          (itemsData ?? []).map((r) => {
            const row = r as Record<string, unknown>
            const toNum = (val: unknown) => {
              if (typeof val === 'number') return val
              if (val === null || val === undefined || val === '') return null
              const n = Number(val)
              return Number.isFinite(n) ? n : null
            }
            return {
              id: String(row.id ?? ''),
              model: (row.model as string | null) ?? null,
              description: (row.description as string | null) ?? null,
              oem: (row.oem as string | null) ?? null,
              qty_available: toNum(row.qty_available),
              currency: (row.currency as string | null) ?? null,
              cost: toNum(row.cost),
            }
          })
        )
        setBuyers(
          (buyersData ?? []).map((b) => ({
            id: String((b as Record<string, unknown>).id ?? ''),
            name: (b as Record<string, unknown>).name as string | null,
            email: (b as Record<string, unknown>).email as string | null,
            company: (b as Record<string, unknown>).company as string | null,
          }))
        )

        await loadQuotes(tenantId, { buyerId: quoteFilterBuyer, text: quoteFilterText, start: quoteStart, end: quoteEnd })
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load quoting data'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [quoteEnd, quoteFilterBuyer, quoteFilterText, quoteStart])

  const visibleItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.model?.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q) ||
        i.oem?.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q)
    )
  }, [items, search])

  const selectedCount = useMemo(() => Object.keys(selected).length, [selected])

  const parsedHistory = (itemId: string): QuoteHistory[] => history[itemId] ?? []

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[id]) {
        delete next[id]
      } else {
        next[id] = { qty: '1', price: '' }
        if (!history[id]) {
          void loadHistory([id])
        }
      }
      return next
    })
  }

  const loadHistory = async (ids: string[]) => {
    if (!ids.length) return
    const { data, error: histErr } = await supabase
      .from('inventory_movements')
      .select('inventory_item_id,reason,created_at')
      .in('inventory_item_id', ids)
      .eq('change_type', 'adjust')
      .ilike('reason', 'quote%')
      .order('created_at', { ascending: false })
      .limit(100)
    if (histErr) {
      console.error(histErr)
      return
    }
    const next: Record<string, QuoteHistory[]> = {}
    for (const row of data ?? []) {
      const itemId = String((row as Record<string, unknown>).inventory_item_id)
      const reason = (row as Record<string, unknown>).reason as string | null
      let payload: QuoteHistory = { created_at: String((row as Record<string, unknown>).created_at ?? new Date().toISOString()) }
      if (reason && reason.startsWith('quote:')) {
        const json = reason.slice('quote:'.length)
        try {
          const parsed = JSON.parse(json) as Record<string, unknown>
          payload = {
            ...payload,
            buyer_name: (parsed.buyer_name as string) ?? null,
            buyer_email: (parsed.buyer_email as string) ?? null,
            price: typeof parsed.price === 'number' ? parsed.price : null,
            qty: typeof parsed.qty === 'number' ? parsed.qty : null,
            subject: (parsed.subject as string) ?? null,
          }
        } catch {
          payload = { ...payload, buyer_name: reason }
        }
      } else if (reason) {
        payload = { ...payload, buyer_name: reason }
      }
      if (!next[itemId]) next[itemId] = []
      next[itemId].push(payload)
    }
    setHistory((prev) => ({ ...prev, ...next }))
  }

  const loadQuotes = async (
    tenantId: string,
    filters: { buyerId?: string; text?: string; start?: string; end?: string } = {}
  ) => {
    let query = supabase
      .from('quotes')
      .select('id,buyer_id,status,subject,created_at,sent_at,buyers(id,name,email,company)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (filters.buyerId) query = query.eq('buyer_id', filters.buyerId)
    if (filters.start) query = query.gte('created_at', filters.start)
    if (filters.end) query = query.lte('created_at', filters.end)
    const { data, error } = await query
    if (error) {
      console.error(error)
      return
    }
    const text = (filters.text ?? '').toLowerCase()
    const mapped =
      (data ?? []).map((r: Record<string, unknown>) => {
        const buyerRaw = Array.isArray(r.buyers) ? r.buyers[0] : r.buyers
        const buyerObj: Buyer | null = buyerRaw
          ? { id: String(buyerRaw.id ?? ''), name: buyerRaw.name ?? null, email: buyerRaw.email ?? null, company: buyerRaw.company ?? null }
          : null
        return {
          id: String(r.id ?? ''),
          buyer: buyerObj,
          subject: r.subject ?? null,
          status: r.status ?? 'sent',
          created_at: r.created_at ?? new Date().toISOString(),
          sent_at: r.sent_at ?? null,
        }
      }) ?? []
    const filtered = text
      ? mapped.filter((q) => {
          const hay = `${q.subject ?? ''} ${q.buyer?.name ?? ''} ${q.buyer?.company ?? ''}`.toLowerCase()
          return hay.includes(text)
        })
      : mapped
    setQuotes(filtered)
  }

  const sendQuote = async () => {
    setError('')
    setSuccess('')
    const buyer = buyers.find((b) => b.id === selectedBuyer)
    if (!buyer) {
      setError('Select a customer to send the quote')
      return
    }
    const payloadItems = Object.entries(selected).map(([id, vals]) => ({
      inventory_item_id: id,
      qty: Number(vals.qty) || 0,
      price: vals.price ? Number(vals.price) : null,
    }))
    if (!payloadItems.length) {
      setError('Select at least one inventory line to quote')
      return
    }
    if (!userId) {
      setError('User not detected; re-authenticate')
      return
    }
    if (payloadItems.some((p) => !p.qty || p.qty <= 0)) {
      setError('All selected lines need a quantity')
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/quotes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          buyer_id: buyer.id,
          items: payloadItems,
          note,
        }),
      })
      const json = (await res.json()) as { ok: boolean; message?: string }
      if (!res.ok || !json.ok) {
        throw new Error(json.message || 'Send failed')
      }
      setSuccess('Quote sent via Outlook')
      setSelected({})
      void loadHistory(payloadItems.map((p) => p.inventory_item_id))
      if (tenantId) {
        await loadQuotes(tenantId, { buyerId: quoteFilterBuyer, text: quoteFilterText, start: quoteStart, end: quoteEnd })
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to send quote'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const convertQuote = async (quoteId: string) => {
    setError('')
    setSuccess('')
    try {
      setLoading(true)
      const res = await fetch('/api/quotes/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quoteId, user_id: userId }),
      })
      const json = (await res.json()) as { ok: boolean; message?: string; sales_order_id?: string }
      if (!res.ok || !json.ok) throw new Error(json.message || 'Convert failed')
      setSuccess(`Converted to Sales Order ${json.sales_order_id}`)
      if (tenantId) {
        await loadQuotes(tenantId, { buyerId: quoteFilterBuyer, text: quoteFilterText, start: quoteStart, end: quoteEnd })
      }
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to convert quote'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Quoting</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 720 }}>
          Build customer quotes directly from inventory. Select parts, set quantities and prices, and send via your Outlook connection.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          placeholder="Search by model, OEM, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 240 }}
        />
        <select
          value={selectedBuyer}
          onChange={(e) => setSelectedBuyer(e.target.value)}
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 220 }}
        >
          <option value="">Select customer</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name || b.company || b.email || 'Customer'} {b.company ? `• ${b.company}` : ''}
            </option>
          ))}
        </select>
        <button
          onClick={sendQuote}
          disabled={loading || !selectedCount}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            fontWeight: 800,
            cursor: loading || !selectedCount ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending…' : `Send quote (${selectedCount})`}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)' }}>Optional note to include in email</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minHeight: 80 }}
        />
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '0.4fr 1.4fr 0.9fr 0.9fr 0.8fr 0.8fr 1fr',
            gap: 0,
            background: 'var(--surface-2)',
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 10 }}>Select</div>
          <div style={{ padding: 10 }}>Part / Description</div>
          <div style={{ padding: 10 }}>OEM</div>
          <div style={{ padding: 10 }}>Qty available</div>
          <div style={{ padding: 10 }}>Quote qty</div>
          <div style={{ padding: 10 }}>Quote price</div>
          <div style={{ padding: 10 }}>History</div>
        </div>

        {visibleItems.map((r) => {
          const sel = selected[r.id]
          return (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '0.4fr 1.4fr 0.9fr 0.9fr 0.8fr 0.8fr 1fr',
                gap: 0,
                borderTop: `1px solid var(--border)`,
                background: 'var(--panel)',
              }}
            >
              <div style={{ padding: 10 }}>
                <input type="checkbox" checked={Boolean(sel)} onChange={() => toggleSelect(r.id)} />
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontWeight: 900 }}>{r.model || r.description || 'Untitled item'}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.description || 'No description'}</div>
              </div>
              <div style={{ padding: 10 }}>{r.oem || '—'}</div>
              <div style={{ padding: 10 }}>{r.qty_available ?? '—'}</div>
              <div style={{ padding: 10 }}>
                <input
                  type="number"
                  value={sel?.qty ?? ''}
                  placeholder="Qty"
                  onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: { qty: e.target.value, price: prev[r.id]?.price ?? '' } }))}
                  disabled={!sel}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    opacity: sel ? 1 : 0.6,
                  }}
                />
              </div>
              <div style={{ padding: 10 }}>
                <input
                  type="number"
                  value={sel?.price ?? ''}
                  placeholder={r.cost != null ? `${money(r.cost, r.currency || 'USD')}` : 'Price'}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [r.id]: { qty: prev[r.id]?.qty ?? '1', price: e.target.value } }))}
                  disabled={!sel}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    opacity: sel ? 1 : 0.6,
                  }}
                />
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Currency: {r.currency || 'USD'}</div>
              </div>
              <div style={{ padding: 10, color: 'var(--muted)', fontSize: 12, display: 'grid', gap: 4 }}>
                {parsedHistory(r.id).length === 0 ? (
                  <span>—</span>
                ) : (
                  parsedHistory(r.id)
                    .slice(0, 3)
                    .map((h, idx) => (
                      <span key={`${r.id}-h-${idx}`}>
                        {h.subject ? `${h.subject} • ` : ''}
                        {h.qty ? `Qty ${h.qty}` : ''}
                        {h.price ? ` @ ${money(h.price, r.currency || 'USD')}` : ''}
                        {h.buyer_name ? ` • ${h.buyer_name}` : ''}
                        {` • ${new Date(h.created_at).toLocaleString()}`}
                      </span>
                    ))
                )}
              </div>
            </div>
          )
        })}

        {loading ? (
          <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12, borderTop: `1px solid var(--border)` }}>Loading…</div>
        ) : visibleItems.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12, borderTop: `1px solid var(--border)` }}>
            No inventory items match your search.
          </div>
        ) : (
          <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12, borderTop: `1px solid var(--border)` }}>
            Showing {visibleItems.length} items ({selectedCount} selected).
          </div>
        )}

        {error ? (
          <div style={{ padding: 12, color: 'var(--bad)', fontSize: 12, borderTop: `1px solid var(--border)` }}>{error}</div>
        ) : null}
        {success ? (
          <div style={{ padding: 12, color: 'var(--good)', fontSize: 12, borderTop: `1px solid var(--border)` }}>{success}</div>
        ) : null}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--panel)', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Quotes</h2>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Filter and convert sent quotes.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={quoteFilterBuyer}
            onChange={async (e) => {
              setQuoteFilterBuyer(e.target.value)
              if (tenantId) await loadQuotes(tenantId, { buyerId: e.target.value, text: quoteFilterText, start: quoteStart, end: quoteEnd })
            }}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
          >
            <option value="">All customers</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || b.company || b.email}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search subject/customer"
            value={quoteFilterText}
            onChange={async (e) => {
              const v = e.target.value
              setQuoteFilterText(v)
              if (tenantId) await loadQuotes(tenantId, { buyerId: quoteFilterBuyer, text: v, start: quoteStart, end: quoteEnd })
            }}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', minWidth: 220 }}
          />
          <input
            type="date"
            value={quoteStart}
            onChange={async (e) => {
              const v = e.target.value
              setQuoteStart(v)
              if (tenantId) await loadQuotes(tenantId, { buyerId: quoteFilterBuyer, text: quoteFilterText, start: v, end: quoteEnd })
            }}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
          />
          <input
            type="date"
            value={quoteEnd}
            onChange={async (e) => {
              const v = e.target.value
              setQuoteEnd(v)
              if (tenantId) await loadQuotes(tenantId, { buyerId: quoteFilterBuyer, text: quoteFilterText, start: quoteStart, end: v })
            }}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {quotes.map((q) => (
            <div key={q.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{q.subject || 'Quote'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {q.buyer?.name || q.buyer?.company || 'Customer'} • {new Date(q.created_at).toLocaleString()} • status {q.status}
                  </div>
                </div>
                <button
                  onClick={() => convertQuote(q.id)}
                  style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                >
                  Convert to Order
                </button>
              </div>
            </div>
          ))}
          {quotes.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>No quotes found.</div> : null}
        </div>
      </div>
    </main>
  )
}
