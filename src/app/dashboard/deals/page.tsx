'use client'

import Link from 'next/link'
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
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
  qty_total: number | null
  cost: number | null
  oem: string | null
}

type BuyerOption = {
  id: string
  name: string | null
  company: string | null
  email: string | null
  tags: string[]
  oem_tags: string[]
  model_tags: string[]
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
  qty_total:
    typeof record.qty_total === 'number'
      ? record.qty_total
      : record.qty_total
      ? Number(record.qty_total)
      : null,
  cost: typeof record.cost === 'number' ? record.cost : record.cost ? Number(record.cost) : null,
  oem: record.oem ? String(record.oem) : null,
})

const mapBuyerRecord = (record: Record<string, unknown>): BuyerOption => ({
  id: String(record.id ?? ''),
  name: record.name ? String(record.name) : null,
  company: record.company ? String(record.company) : null,
  email: record.email ? String(record.email) : null,
  tags: Array.isArray(record.tags) ? (record.tags as string[]) : [],
  oem_tags: Array.isArray(record.oem_tags) ? (record.oem_tags as string[]) : [],
  model_tags: Array.isArray(record.model_tags) ? (record.model_tags as string[]) : [],
})

const computeSoldVolume = (item: InventoryOption) =>
  Math.max(0, (item.qty_total ?? 0) - (item.qty_available ?? 0))

const countBuyerMatches = (item: InventoryOption, buyers: BuyerOption[]) => {
  const target = (item.oem ?? item.model ?? '').toLowerCase()
  if (!target) return 0
  return buyers.reduce((total, buyer) => {
    const hasOem = buyer.oem_tags.some((tag) => tag?.toLowerCase() === target)
    const hasModel = buyer.model_tags.some((tag) => tag?.toLowerCase() === target)
    const hasTag = buyer.tags.some((tag) => tag?.toLowerCase() === target)
    return total + Number(hasOem || hasModel || hasTag)
  }, 0)
}

const renderInventoryTable = (
  items: InventoryOption[],
  selectedInventory: Record<string, { qty: string; ask: string }>,
  toggleInventorySelection: (item: InventoryOption) => void
) => {
  if (!items.length) {
    return (
      <p style={{ marginTop: 12, color: 'var(--muted)' }}>
        No stock matches this search or recommendation yet.
      </p>
    )
  }
  return (
    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }} />
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>P/N</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>OEM</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Description</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Available</th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 8 }}>
                <input
                  type="checkbox"
                  checked={!!selectedInventory[item.id]}
                  onChange={() => toggleInventorySelection(item)}
                />
              </td>
              <td style={{ padding: 8 }}>{item.model ?? '-'}</td>
              <td style={{ padding: 8 }}>{item.oem ?? '-'}</td>
              <td style={{ padding: 8 }}>{item.description ?? '-'}</td>
              <td style={{ padding: 8 }}>{item.qty_available ?? 'n/a'}</td>
              <td style={{ padding: 8 }}>{item.cost !== null ? `${item.cost}` : 'n/a'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DealsPage() {
  const [deals, setDeals] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [dealTitle, setDealTitle] = useState('')
  const [dealMode] = useState<'one-to-many' | 'one-to-one'>('one-to-many')
  const [dealKey] = useState(generateDealKey())
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
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [modalLoading, setModalLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<InventoryOption[]>([])
  const [recommendMode, setRecommendMode] = useState<
    'fastest-moving' | 'highest-cost' | 'most-matched'
  >('fastest-moving')
  const [recommendList, setRecommendList] = useState<InventoryOption[]>([])
  const [showRecommend, setShowRecommend] = useState(false)

  const fetchInventoryOptions = useCallback(async () => {
    setModalLoading(true)
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id,model,description,qty_available,qty_total,cost,oem')
        .order('created_at', { ascending: false })
        .limit(20)
      if (!error && data) {
        setInventoryItems(data.map(mapInventoryRecord))
      }
    } finally {
      setModalLoading(false)
    }
  }, [])

  const fetchBuyerOptions = useCallback(async () => {
    setModalLoading(true)
    try {
      const { data, error } = await supabase
        .from('buyers')
        .select('id,name,company,email,oem_tags,model_tags,tags')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!error && data) {
        setBuyers(data.map(mapBuyerRecord))
      }
    } finally {
      setModalLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!showCreate) return
    fetchInventoryOptions()
    fetchBuyerOptions()
  }, [showCreate, fetchInventoryOptions, fetchBuyerOptions])

  const handleFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      setUploadFileName(file.name)
      try {
        const text = await file.text()
        const rows = parseCsv(text)
        const parsed = rows.map((cells) => ({
          line_ref: cells[0] ?? '',
          model: cells[1] ?? null,
          description: cells[2] ?? null,
          qty: cells[3] ? Number(cells[3]) : null,
        }))
        setUploadedRows(parsed)
        setUploadError('')
      } catch {
        setUploadError('Unable to parse file')
      }
    },
    []
  )

  const toggleInventorySelection = useCallback(
    (item: InventoryOption) => {
      setSelectedInventory((prev) => {
        if (prev[item.id]) {
          const next = { ...prev }
          delete next[item.id]
          return next
        }
        return {
          ...prev,
          [item.id]: {
            qty: String(item.qty_available ?? 1),
            ask: '',
          },
        }
      })
    },
    []
  )

  const toggleBuyer = useCallback(
    (id: string) => {
      setSelectedBuyerIds((prev) =>
        prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
      )
    },
    []
  )

  const handleSearchStock = useCallback(() => {
    const query = searchText.trim().toLowerCase()
    if (!query) {
      setSearchResults([])
      return
    }
    const matches = inventoryItems.filter((item) => {
      const model = item.model ?? ''
      const description = item.description ?? ''
      return (
        model.toLowerCase().includes(query) || description.toLowerCase().includes(query)
      )
    })
    setSearchResults(matches)
    setShowRecommend(false)
  }, [inventoryItems, searchText])

  const handleRecommendStock = useCallback(() => {
    if (!inventoryItems.length) return
    const list = [...inventoryItems]
    switch (recommendMode) {
      case 'fastest-moving':
        list.sort((a, b) => computeSoldVolume(b) - computeSoldVolume(a))
        break
      case 'highest-cost':
        list.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
        break
      case 'most-matched':
        list.sort((a, b) => countBuyerMatches(b, buyers) - countBuyerMatches(a, buyers))
        break
      default:
        break
    }
    setRecommendList(list.slice(0, 10))
    setShowRecommend(true)
    setSearchResults([])
  }, [buyers, inventoryItems, recommendMode])

  const selectedInventoryLines = useMemo(() => {
    return Object.entries(selectedInventory)
      .map(([id, meta]) => {
        const item = inventoryItems.find((entry) => entry.id === id)
        if (!item) return null
        const fallbackRef = `INV-${id.slice(0, 4).toUpperCase()}`
        const sanitizedRef = (item.model ?? item.description ?? fallbackRef)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
        return {
          line_ref: sanitizedRef || fallbackRef,
          model: item.model,
          description: item.description,
          qty: Number(meta.qty) || item.qty_available || null,
        }
      })
      .filter((line): line is { line_ref: string; model: string | null; description: string | null; qty: number | null } => !!line)
  }, [inventoryItems, selectedInventory])

  const combinedLines = useMemo(
    () => [...selectedInventoryLines, ...uploadedRows],
    [selectedInventoryLines, uploadedRows]
  )

  const previewSubject = offerSubject || `Deal outreach ${dealKey}`

  const recommendedBuyers = useMemo(() => {
    const tokens = combinedLines
      .map((line) => `${line.model ?? ''} ${line.description ?? ''}`)
      .join(' ')
      .toLowerCase()
    return buyers
      .map((buyer) => {
        let score = 0
        if (buyer.name && tokens.includes(buyer.name.toLowerCase())) score += 2
        if (buyer.company && tokens.includes(buyer.company.toLowerCase())) score += 1
        buyer.oem_tags.forEach((tag) => {
          if (tokens.includes(tag.toLowerCase())) score += 3
        })
        buyer.model_tags.forEach((tag) => {
          if (tokens.includes(tag.toLowerCase())) score += 2
        })
        return { buyer, score }
      })
      .sort((a, b) => b.score - a.score)
  }, [buyers, combinedLines])

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // ignore
    }
  }, [])

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

  const handleMarkAsSent = useCallback(async () => {
    if (!dealTitle.trim()) {
      setSendError('Provide a deal title before sending.')
      return
    }
    if (!selectedBuyerIds.length) {
      setSendError('Select at least one buyer.')
      return
    }
    setSending(true)
    try {
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' })
    const body = {
        buyer_id: selectedBuyerIds[0],
        title: dealTitle,
        currency: 'USD',
        source: dealMode === 'one-to-one' ? 'flip' : 'inventory',
        status: 'outreach',
      }
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const payload = await res.json()
      if (!payload.ok || !payload.deal?.id) {
        throw new Error(payload.message ?? 'Unable to create deal.')
      }
      const id = payload.deal.id
      const threadPromises = selectedBuyerIds.map(async (buyerId) => {
        const buyer = buyers.find((entry) => entry.id === buyerId)
        if (!buyer?.email) return
        const threadRes = await fetch(`/api/deals/${id}/threads`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            buyer_email: buyer.email,
            buyer_name: buyer.name ?? buyer.company ?? 'Buyer',
            subject_template: offerSubject || `Deal ${dealTitle}`,
            subject_key: dealKey,
          }),
        })
        const body = await threadRes.json()
        if (!body.ok) {
      throw new Error(body.message ?? `Unable to create thread for ${buyer.email}`)
      }
    })
    await Promise.all(threadPromises)
      const payloadLines = combinedLines
        .filter((line) => line.line_ref)
        .map((line) => ({
          source: line.model ? 'inventory' : 'flip',
          line_ref: line.line_ref,
          qty: line.qty ?? 1,
          model: line.model,
          description: line.description,
        }))
      if (payloadLines.length) {
        await Promise.all(
          payloadLines.map((line) =>
            fetch(`/api/deals/${id}/lines`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                ...line,
                currency: 'USD',
              }),
            })
          )
        )
      }
      await loadDealsFromServer()
      setShowCreate(false)
      setSendError('')
    } catch (err) {
      setSendError((err as Error).message ?? 'Failed to mark as sent.')
    } finally {
      setSending(false)
    }
  }, [
    buyers,
    combinedLines,
    dealKey,
    dealMode,
    dealTitle,
    getAuthHeaders,
    loadDealsFromServer,
    offerSubject,
    selectedBuyerIds,
  ])

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
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          style={{ padding: '10px 18px', fontSize: 14 }}
          onClick={() => setShowCreate(true)}
        >
          Create deal
        </button>
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
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
            zIndex: 40,
          }}
        >
          <div
            style={{
              width: 'min(1100px, 100%)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--surface)',
              borderRadius: 18,
              padding: 24,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0 }}>Create Deal</h2>
                <p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>
                  Define equipment, target buyers, and craft the Outlook email before outreach.
                </p>
              </div>
              <button className="ui-btn ui-btn-ghost" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              <input
                type="text"
                placeholder="Deal title"
                className="ui-input"
                value={dealTitle}
                onChange={(e) => setDealTitle(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`ui-btn ${clickedTab === 'inventory' ? 'ui-btn-primary' : ''}`}
                  onClick={() => setClickedTab('inventory')}
                >
                  Inventory
                </button>
                <button
                  type="button"
                  className={`ui-btn ${clickedTab === 'upload' ? 'ui-btn-primary' : ''}`}
                  onClick={() => setClickedTab('upload')}
                >
                  Upload XLSX
                </button>
              </div>

              {clickedTab === 'inventory' ? (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <input
                      type="search"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Part number or description"
                      className="ui-input"
                      style={{ flex: '1 1 240px' }}
                    />
                    <button type="button" className="ui-btn" onClick={handleSearchStock}>
                      Search stock
                    </button>
                    <select
                      value={recommendMode}
                      onChange={(e) =>
                        setRecommendMode(
                          e.target.value as 'fastest-moving' | 'highest-cost' | 'most-matched'
                        )
                      }
                      className="ui-select"
                      style={{ minWidth: 170 }}
                    >
                      <option value="fastest-moving">Fastest moving</option>
                      <option value="highest-cost">Highest cost</option>
                      <option value="most-matched">Most matched customers</option>
                    </select>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost"
                      onClick={handleRecommendStock}
                    >
                      Recommend stock
                    </button>
                  </div>
                  {modalLoading ? (
                    <p>Loading inventory…</p>
                  ) : (
                    <>
                      {(() => {
                        const displayItems = searchResults.length
                          ? searchResults
                          : showRecommend
                          ? recommendList
                          : []
                        if (displayItems.length) {
                          return renderInventoryTable(
                            displayItems,
                            selectedInventory,
                            toggleInventorySelection
                          )
                        }
                        return (
                          <p style={{ marginTop: 12, color: 'var(--muted)' }}>
                            {searchResults.length
                              ? 'No inventory matches that search term.'
                              : showRecommend
                              ? 'No recommended stock matches that filter.'
                              : 'Search stock or request recommendations to browse inventory.'}
                          </p>
                        )
                      })()}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <input type="file" accept=".csv,.xlsx,.txt" onChange={handleFileUpload} />
                  {uploadFileName && <p style={{ margin: 4 }}>Loaded {uploadFileName}</p>}
                  {uploadError && (
                    <p style={{ margin: 4, color: 'var(--bad)' }}>{uploadError}</p>
                  )}
                  <div style={{ marginTop: 16 }}>
                    Uploaded rows:
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {uploadedRows.map((row, index) => (
                        <div
                          key={`${row.line_ref}-${index}`}
                          style={{
                            border: '1px dashed var(--border)',
                            padding: 8,
                            borderRadius: 8,
                            flex: '1 1 150px',
                          }}
                        >
                          <strong>{row.line_ref || 'Line ref missing'}</strong>
                          <div style={{ fontSize: 12 }}>
                            {row.model ?? row.description ?? 'No description'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 16,
                  display: 'grid',
                  gap: 16,
                }}
              >
                <div>
                  <h4 style={{ margin: '0 0 8px' }}>Target buyers</h4>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                    Select the buyers you want to contact. Recommended buyers appear first.
                  </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {recommendedBuyers.slice(0, 10).map(({ buyer, score }) => (
                    <button
                      key={buyer.id}
                      type="button"
                      className="ui-btn ui-btn-ghost"
                      style={{
                        borderColor: selectedBuyerIds.includes(buyer.id)
                          ? 'var(--accent)'
                          : 'var(--border)',
                        backgroundColor: selectedBuyerIds.includes(buyer.id)
                          ? 'rgba(14,165,233,0.1)'
                          : 'transparent',
                      }}
                      onClick={() => toggleBuyer(buyer.id)}
                    >
                      <strong style={{ display: 'block', fontSize: 12 }}>{buyer.name ?? 'Buyer'}</strong>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {buyer.company ?? 'Company'} • Score {score}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 16,
                  display: 'grid',
                  gap: 12,
                }}
              >
                <textarea
                  value={offerBody}
                  onChange={(e) => setOfferBody(e.target.value)}
                  rows={3}
                  className="ui-textarea"
                  style={{ resize: 'vertical' }}
                />
                <input
                  type="text"
                  placeholder="Email subject"
                  className="ui-input"
                  value={offerSubject}
                  onChange={(e) => setOfferSubject(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="ui-btn" onClick={() => handleCopy(offerSubject || previewSubject)}>
                    Copy subject
                  </button>
                  <button type="button" className="ui-btn" onClick={() => handleCopy(offerBody)}>
                    Copy body
                  </button>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 4 }}>Line Ref</th>
                        <th style={{ textAlign: 'left', padding: 4 }}>P/N</th>
                        <th style={{ textAlign: 'left', padding: 4 }}>Description</th>
                        <th style={{ textAlign: 'left', padding: 4 }}>Qty</th>
                        <th style={{ textAlign: 'left', padding: 4 }}>Offer (£)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinedLines.length ? (
                        combinedLines.map((line, index) => (
                          <tr key={`${line.line_ref}-${index}`}>
                            <td style={{ padding: 4 }}>{line.line_ref}</td>
                            <td style={{ padding: 4 }}>{line.model ?? '—'}</td>
                            <td style={{ padding: 4 }}>{line.description ?? '—'}</td>
                            <td style={{ padding: 4 }}>{line.qty ?? '—'}</td>
                            <td style={{ padding: 4 }}>—</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} style={{ padding: 8, textAlign: 'center', color: 'var(--muted)' }}>
                            Add inventory or upload rows to seed the table.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {sendError && (
                  <p style={{ color: 'var(--bad)', margin: 0 }}>{sendError}</p>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    onClick={handleMarkAsSent}
                    disabled={sending}
                  >
                    {sending ? 'Sending…' : 'Mark as sent'}
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setShowCreate(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
