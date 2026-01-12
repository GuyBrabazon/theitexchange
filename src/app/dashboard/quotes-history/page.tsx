"use client"

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Buyer = { id: string; name: string | null; email: string | null; company: string | null }
type QuoteLine = { model: string | null; description: string | null; oem: string | null; qty: number | null; price: number | null; currency: string | null }
type Quote = {
  id: string
  subject: string | null
  status: string
  created_at: string
  sent_at: string | null
  buyer: Buyer | null
  lines: QuoteLine[]
}

export default function QuotesHistoryPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filterBuyer, setFilterBuyer] = useState('')
  const [filterText, setFilterText] = useState('')
  const [filterStart, setFilterStart] = useState('')
  const [filterPart, setFilterPart] = useState('')

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
        const [{ data: buyersData, error: buyersErr }, { data: quotesData, error: quotesErr }] = await Promise.all([
          supabase.from('buyers').select('id,name,email,company').eq('tenant_id', tenant).order('name', { ascending: true }),
          supabase
            .from('quotes')
            .select('id,subject,status,created_at,sent_at,buyer_id,buyers(id,name,email,company),quote_lines(model,description,oem,qty,price,currency)')
            .eq('tenant_id', tenant)
            .order('created_at', { ascending: false })
            .limit(500),
        ])
        if (buyersErr) throw buyersErr
        if (quotesErr) throw quotesErr

        setBuyers(
          (buyersData ?? []).map((b) => {
            const nameVal = (b as { name?: unknown }).name
            const emailVal = (b as { email?: unknown }).email
            const companyVal = (b as { company?: unknown }).company
            return {
              id: String((b as { id?: unknown }).id ?? ''),
              name: typeof nameVal === 'string' ? nameVal : null,
              email: typeof emailVal === 'string' ? emailVal : null,
              company: typeof companyVal === 'string' ? companyVal : null,
            }
          })
        )

        setQuotes(
          (quotesData ?? []).map((q) => {
            const buyersField = (q as { buyers?: unknown }).buyers
            const buyerRec = Array.isArray(buyersField) ? buyersField[0] : buyersField
            const linesRec = (q as { quote_lines?: QuoteLine[] }).quote_lines
            const buyerName = (buyerRec as { name?: unknown })?.name
            const buyerEmail = (buyerRec as { email?: unknown })?.email
            const buyerCompany = (buyerRec as { company?: unknown })?.company
            return {
              id: String((q as { id?: unknown }).id ?? ''),
              subject: (q as { subject?: unknown }).subject == null ? null : String((q as { subject?: unknown }).subject),
              status: (q as { status?: unknown }).status == null ? 'sent' : String((q as { status?: unknown }).status),
              created_at: (q as { created_at?: unknown }).created_at ? String((q as { created_at?: unknown }).created_at) : new Date().toISOString(),
              sent_at: (q as { sent_at?: unknown }).sent_at ? String((q as { sent_at?: unknown }).sent_at) : null,
              buyer: buyerRec
                ? {
                    id: String((buyerRec as { id?: unknown }).id ?? ''),
                    name: typeof buyerName === 'string' ? buyerName : null,
                    email: typeof buyerEmail === 'string' ? buyerEmail : null,
                    company: typeof buyerCompany === 'string' ? buyerCompany : null,
                  }
                : null,
              lines: Array.isArray(linesRec)
                ? linesRec.map((l) => ({
                    model: l.model ?? null,
                    description: l.description ?? null,
                    oem: l.oem ?? null,
                    qty: l.qty == null ? null : Number(l.qty),
                    price: l.price == null ? null : Number(l.price),
                    currency: l.currency ?? null,
                  }))
                : [],
            }
          })
        )
      } catch (e) {
        console.error(e)
        setError(e instanceof Error ? e.message : 'Failed to load quotes')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      if (filterBuyer && q.buyer?.id !== filterBuyer) return false
      if (filterStart && new Date(q.created_at) < new Date(filterStart)) return false
      const text = filterText.toLowerCase()
      if (text) {
        const hay = `${q.subject ?? ''} ${q.buyer?.name ?? ''} ${q.buyer?.company ?? ''}`.toLowerCase()
        if (!hay.includes(text)) return false
      }
      const part = filterPart.toLowerCase()
      if (part) {
        const matchLine = q.lines.some((l) =>
          `${l.model ?? ''} ${l.description ?? ''} ${l.oem ?? ''}`.toLowerCase().includes(part)
        )
        if (!matchLine) return false
      }
      return true
    })
  }, [quotes, filterBuyer, filterText, filterStart, filterPart])

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Past Quotes</h1>
        <p style={{ color: 'var(--muted)' }}>Search and filter historical quotes. Use this to respond to follow-ups or convert manually.</p>
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select
          value={filterBuyer}
          onChange={(e) => setFilterBuyer(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
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
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 220 }}
        />
        <input
          type="search"
          placeholder="Search part/model/OEM"
          value={filterPart}
          onChange={(e) => setFilterPart(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 220 }}
        />
        <input
          type="date"
          value={filterStart}
          onChange={(e) => setFilterStart(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
        />
      </div>

      {error ? (
        <div style={{ color: 'var(--bad)', border: '1px solid var(--bad)', borderRadius: 10, padding: 12, background: 'rgba(178,58,58,0.08)' }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading quotes…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--muted)' }}>No quotes match your filters.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map((q) => (
            <div key={q.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel)', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{q.subject || 'Quote'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {q.buyer?.name || q.buyer?.company || 'Customer'} • {new Date(q.created_at).toLocaleString()} • status {q.status}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}>
                    Convert to order
                  </button>
                  <button style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}>
                    Edit convert
                  </button>
                </div>
              </div>
              {q.lines.length ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.8fr 0.6fr 0.6fr 0.6fr',
                      background: 'var(--surface-2)',
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ padding: 8 }}>Part / Description</div>
                    <div style={{ padding: 8 }}>OEM</div>
                    <div style={{ padding: 8 }}>Qty</div>
                    <div style={{ padding: 8 }}>Price</div>
                    <div style={{ padding: 8 }}>Currency</div>
                  </div>
                  {q.lines.map((l, idx) => (
                    <div
                      key={`${q.id}-line-${idx}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 0.8fr 0.6fr 0.6fr 0.6fr',
                        borderTop: '1px solid var(--border)',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ padding: 8 }}>
                        <div style={{ fontWeight: 800 }}>{l.model || l.description || 'Line'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{l.description || ''}</div>
                      </div>
                      <div style={{ padding: 8 }}>{l.oem || '—'}</div>
                      <div style={{ padding: 8 }}>{l.qty ?? '—'}</div>
                      <div style={{ padding: 8 }}>{l.price ?? '—'}</div>
                      <div style={{ padding: 8 }}>{l.currency || '—'}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
