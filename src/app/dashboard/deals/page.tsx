'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

type InventoryOption = {
  id: string
  model: string | null
  description: string | null
  qty_available: number | null
}

type BuyerOption = {
  id: string
  name: string | null
  company: string | null
  email: string | null
}

function generateDealKey() {
  const prefix = 'DL-'
  const random = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return `${prefix}${random.padEnd(8, '0')}`
}

function parseCsv(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()))
}

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [dealTitle, setDealTitle] = useState('')
  const [dealMode, setDealMode] = useState<'one-to-many' | 'one-to-one'>('one-to-many')
  const [dealKey, setDealKey] = useState(generateDealKey())
  const [dealId, setDealId] = useState<string | null>(null)
  const [inventoryItems, setInventoryItems] = useState<InventoryOption[]>([])
  const [buyers, setBuyers] = useState<BuyerOption[]>([])
  const [selectedInventory, setSelectedInventory] = useState<Record<string, { qty: string; ask: string }>>({})
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<string[]>([])
  const [offerSubject, setOfferSubject] = useState('')
  const [offerBody, setOfferBody] = useState('Please reply with your offer in the table below.')
  const [clickedTab, setClickedTab] = useState<'inventory' | 'upload'>('inventory')
  const [uploadedRows, setUploadedRows] = useState<
    { line_ref: string; model: string | null; description: string | null; qty: number | null }[]
  >([])
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [createError, setCreateError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const mapInventoryRecord = (record: Record<string, unknown>): InventoryOption => ({
    id: String(record.id ?? ''),
    model: record.model ? String(record.model) : null,
    description: record.description ? String(record.description) : null,
    qty_available:
      typeof record.qty_available === 'number'
        ? record.qty_available
        : record.qty_available
        ? Number(record.qty_available)
        : null,
  })

  const mapBuyerRecord = (record: Record<string, unknown>): BuyerOption => ({
    id: String(record.id ?? ''),
    name: record.name ? String(record.name) : null,
    company: record.company ? String(record.company) : null,
    email: record.email ? String(record.email) : null,
  })

  const getAuthHeaders = useCallback(async (extra: Record<string, string> = {}) => {
    const { data } = await supabase.auth.getSession()
    const sessionData = data?.session as { access_token?: string } | null
    const token = sessionData?.access_token
    return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
  }, [])

  const fetchDeals = useCallback(async () => {
    const headers = await getAuthHeaders()
    const res = await fetch('/api/deals', {
      headers,
      credentials: 'include',
    })
    return res.json()
  }, [getAuthHeaders])

  const loadDealsFromServer = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await fetchDeals()
      if (payload.ok) {
        setDeals(payload.deals ?? [])
      } else {
        setError(payload.message ?? 'Failed to load deals.')
      }
    } catch {
      setError('Unable to load deals.')
    } finally {
      setLoading(false)
    }
  }, [fetchDeals])

  useEffect(() => {
    let isMounted = true
    const run = async () => {
      await loadDealsFromServer()
      if (!isMounted) return
    }
    run()
    return () => {
      isMounted = false
    }
  }, [loadDealsFromServer])

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
          Loading dealsÔÇª
        </div>
      ) : error ? (
        <div style={{ padding: 16, color: 'var(--bad)', border: '1px solid var(--border)', borderRadius: 12 }}>
          {error}
        </div>
      ) : !filteredDeals.length ? (
        <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, color: 'var(--muted)' }}>
          No deals found. Start by clicking ÔÇ£Create dealÔÇØ.
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
                  {deal.buyer ? `${deal.buyer.name ?? 'Unknown'} ÔÇö ${deal.buyer.company ?? 'Buyer'}` : 'Buyer pending'}
                </p>
                <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12 }}>
                  <span>{deal.currency ?? 'USD'} ┬À {deal.source ?? 'mixed'}</span>
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
