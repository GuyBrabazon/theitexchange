'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type DealRow = {
  id: string
  title: string | null
  status: string | null
  currency: string | null
  source: string | null
  last_activity_at: string | null
  buyer: {
    id: string
    name: string | null
    company: string | null
  } | null
}

const statusOptions = [
  'draft',
  'outreach',
  'negotiating',
  'agreed',
  'ordered',
  'fulfilled',
  'closed',
  'lost',
]

const statusPalette: Record<string, string> = {
  draft: '#9ca3af',
  outreach: '#f97316',
  negotiating: '#facc15',
  agreed: '#10b981',
  ordered: '#0ea5e9',
  fulfilled: '#7c3aed',
  closed: '#475569',
  lost: '#ef4444',
}

function formatDate(value?: string | null) {
  if (!value) return 'n/a'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let isMounted = true
    const loadDeals = async () => {
      if (!isMounted) return
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/api/deals')
        const payload = await res.json()
        if (!isMounted) return
        if (payload.ok) {
          setDeals(payload.deals ?? [])
        } else {
          setError(payload.message ?? 'Failed to load deals.')
        }
      } catch {
        if (isMounted) setError('Unable to load deals.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadDeals()
    return () => {
      isMounted = false
    }
  }, [])

  const filteredDeals = useMemo(() => {
    return deals
      .filter((deal) => {
        if (statusFilter !== 'all' && (deal.status ?? '').toLowerCase() !== statusFilter) {
          return false
        }
        if (!search) return true
        const query = search.toLowerCase()
        const titleMatch = (deal.title ?? '').toLowerCase().includes(query)
        const buyerName = deal.buyer?.name ?? ''
        const buyerCompany = deal.buyer?.company ?? ''
        const buyerMatch =
          buyerName.toLowerCase().includes(query) || buyerCompany.toLowerCase().includes(query)
        return titleMatch || buyerMatch
      })
      .sort((a, b) => {
        const da = a.last_activity_at ?? ''
        const db = b.last_activity_at ?? ''
        return db.localeCompare(da)
      })
  }, [deals, search, statusFilter])

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Deals</h1>
          <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
            Manage Outlook-first workflows and record customer outreach.
          </p>
        </div>
        <Link
          href="#"
          className="ui-btn ui-btn-primary"
          style={{ padding: '10px 18px', fontSize: 14, textDecoration: 'none' }}
        >
          Create deal
        </Link>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Search</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title / buyer"
            className="ui-input"
          />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Status filter</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ui-select"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value.replace(/^\w/, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 16, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 12 }}>
          Loading deals…
        </div>
      ) : error ? (
        <div style={{ padding: 16, color: 'var(--bad)', border: '1px solid var(--border)', borderRadius: 12 }}>
          {error}
        </div>
      ) : !filteredDeals.length ? (
        <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, color: 'var(--muted)' }}>
          No deals found. Start by clicking “Create deal”.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          {filteredDeals.map((deal) => (
            <Link
              key={deal.id}
              href={`/dashboard/deals/${deal.id}`}
              style={{
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <article
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minHeight: 220,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: statusPalette[(deal.status ?? 'draft').toLowerCase()] ?? '#9ca3af',
                    }}
                  />
                  <strong style={{ fontSize: 12, textTransform: 'uppercase' }}>{deal.status ?? 'draft'}</strong>
                </div>
                <h3 style={{ margin: 0, fontSize: 18 }}>{deal.title ?? 'Untitled deal'}</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                  {deal.buyer ? `${deal.buyer.name ?? 'Unknown'} — ${deal.buyer.company ?? 'Buyer'}` : 'Buyer pending'}
                </p>
                <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                  <span>{deal.currency ?? 'USD'} · {deal.source ?? 'mixed'}</span>
                  <span>Updated {formatDate(deal.last_activity_at)}</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
