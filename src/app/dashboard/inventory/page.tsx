'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildSheetFromMatrix, parseSpreadsheetMatrix } from '@/lib/parseSpreadsheet'

type InventoryRow = {
  id: string
  tenant_id: string
  model: string | null
  description: string | null
  oem: string | null
  condition: string | null
  location: string | null
  status: string | null
  qty_total: number | null
  qty_available: number | null
  cost: number | null
  currency: string | null
  specs: Record<string, unknown> | null
}

const statusLegend = [
  { label: 'Available', color: 'var(--good)' },
  { label: 'Reserved', color: 'var(--warn)' },
  { label: 'Auction', color: 'var(--accent)' },
  { label: 'Allocated', color: 'var(--info)' },
  { label: 'Sold', color: 'var(--bad)' },
]

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [manual, setManual] = useState({
    model: '',
    description: '',
    oem: '',
    condition: '',
    location: '',
    qty_total: '',
    qty_available: '',
    cost: '',
    currency: '',
  })
  const [uploadHeaderRow, setUploadHeaderRow] = useState<number>(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser()
      if (userErr) throw userErr
      const user = userRes.user
      if (!user) throw new Error('Not signed in')

      const { data: profile, error: profileErr } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      if (profileErr) throw profileErr
      const tenantId = profile?.tenant_id
      if (!tenantId) throw new Error('Tenant not found')

      const { data, error: invErr } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (invErr) throw invErr

      const mapped: InventoryRow[] =
        (data ?? []).map((rec) => {
          const row = rec as Record<string, unknown>
          const toNum = (val: unknown) => {
            if (typeof val === 'number') return val
            if (val === null || val === undefined || val === '') return null
            const n = Number(val)
            return Number.isFinite(n) ? n : null
          }
          return {
            id: String(row.id ?? ''),
            tenant_id: String(row.tenant_id ?? ''),
            model: (row.model as string | null) ?? null,
            description: (row.description as string | null) ?? null,
            oem: (row.oem as string | null) ?? null,
            condition: (row.condition as string | null) ?? null,
            location: (row.location as string | null) ?? null,
            status: (row.status as string | null) ?? null,
            qty_total: toNum(row.qty_total),
            qty_available: toNum(row.qty_available),
            cost: toNum(row.cost),
            currency: (row.currency as string | null) ?? null,
            specs: (row.specs as Record<string, unknown> | null) ?? null,
          }
        }) ?? []

      setRows(mapped)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load inventory'
      setError(msg)
    } finally {
      setLoading(false)
      setSelectedIds(new Set())
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const statusOk = statusFilter === 'all' || (r.status ?? 'available')?.toLowerCase() === statusFilter
      return statusOk
    })
  }, [rows, statusFilter])

  const counters = useMemo(() => {
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      const key = (r.status ?? 'available').toLowerCase()
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return { total: rows.length, byStatus }
  }, [rows])

  const insertInventory = async (payloads: Partial<InventoryRow>[]) => {
    const normalized = payloads.map((p) => ({
      model: p.model || null,
      description: p.description || p.model || null,
      oem: p.oem || null,
      condition: p.condition || null,
      location: p.location || null,
      status: p.status || 'available',
      qty_total: p.qty_total ?? null,
      qty_available: p.qty_available ?? p.qty_total ?? null,
      cost: p.cost ?? null,
      currency: p.currency || 'USD',
      specs: p.specs ?? {},
    }))
    const { error: insErr } = await supabase.from('inventory_items').insert(normalized)
    if (insErr) throw insErr
  }

  const addManual = async () => {
    try {
      setLoading(true)
      const qty_total = manual.qty_total ? Number(manual.qty_total) : null
      const qty_available = manual.qty_available ? Number(manual.qty_available) : qty_total
      const cost = manual.cost ? Number(manual.cost) : null
      await insertInventory([
        {
          model: manual.model,
          description: manual.description,
          oem: manual.oem,
          condition: manual.condition,
          location: manual.location,
          qty_total,
          qty_available,
          cost,
          currency: manual.currency || 'USD',
        },
      ])
      setManual({
        model: '',
        description: '',
        oem: '',
        condition: '',
        location: '',
        qty_total: '',
        qty_available: '',
        cost: '',
        currency: '',
      })
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to add inventory'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    try {
      setLoading(true)
      const matrix = await parseSpreadsheetMatrix(file, 2000)
      const sheet = buildSheetFromMatrix(matrix, uploadHeaderRow)

      const mapVal = (row: Record<string, unknown>, keys: string[]) => {
        const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]))
        for (const k of keys) {
          const v = lower[k.toLowerCase()]
          if (v !== undefined && String(v).trim() !== '') return v
        }
        return ''
      }

      const inserts = sheet.rows.map((r) => {
        const obj = r as Record<string, unknown>
        const model = mapVal(obj, ['model', 'sku', 'part', 'description'])
        const desc = mapVal(obj, ['description', 'details'])
        const oem = mapVal(obj, ['oem', 'manufacturer'])
        const condition = mapVal(obj, ['condition'])
        const location = mapVal(obj, ['location', 'site', 'warehouse'])
        const qtyRaw = mapVal(obj, ['qty', 'quantity', 'qty_total'])
        const costRaw = mapVal(obj, ['cost', 'cost price'])
        const currency = mapVal(obj, ['currency'])
        const qty_total = qtyRaw ? Number(qtyRaw) : null
        const cost = costRaw ? Number(costRaw) : null
        return {
          model: model ? String(model) : null,
          description: desc ? String(desc) : model ? String(model) : null,
          oem: oem ? String(oem) : null,
          condition: condition ? String(condition) : null,
          location: location ? String(location) : null,
          qty_total,
          qty_available: qty_total,
          cost,
          currency: currency ? String(currency) : 'USD',
          specs: {},
        }
      })

      const valid = inserts.filter((i) => i.model || i.qty_total || i.cost)
      if (!valid.length) throw new Error('No rows with values found to import')
      await insertInventory(valid)
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const updateInventory = async (id: string, patch: Record<string, unknown>) => {
    try {
      setLoading(true)
      const { error: upErr } = await supabase.from('inventory_items').update(patch).eq('id', id)
      if (upErr) throw upErr
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Update failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const markAuction = async () => {
    if (!selectedIds.size) return
    await Promise.all(Array.from(selectedIds).map((id) => updateInventory(id, { status: 'auction', specs: { auction: true } })))
    setSelectedIds(new Set())
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Inventory</h1>
        <div style={{ color: 'var(--muted)', marginBottom: 12 }}>
          Organisation-owned stock; lots should pull from here (flip lots leave inventory unlinked).
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            <label style={{ cursor: 'pointer' }}>
              Upload XLSX
              <input
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                  e.target.value = ''
                }}
              />
            </label>
          </button>
          <button
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
            onClick={addManual}
          >
            Add item
          </button>
          <button
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: selectedIds.size ? 'pointer' : 'not-allowed',
            }}
            disabled={!selectedIds.size}
            onClick={markAuction}
          >
            Put selected to auction
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Status filter</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
          >
            <option value="all">All statuses</option>
            {Array.from(new Set(rows.map((r) => (r.status ?? 'available').toLowerCase()))).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Manual add</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Model/Part"
              value={manual.model}
              onChange={(e) => setManual((prev) => ({ ...prev, model: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="Description"
              value={manual.description}
              onChange={(e) => setManual((prev) => ({ ...prev, description: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="OEM"
              value={manual.oem}
              onChange={(e) => setManual((prev) => ({ ...prev, oem: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="Condition"
              value={manual.condition}
              onChange={(e) => setManual((prev) => ({ ...prev, condition: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="Location"
              value={manual.location}
              onChange={(e) => setManual((prev) => ({ ...prev, location: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="number"
              placeholder="Qty total"
              value={manual.qty_total}
              onChange={(e) => setManual((prev) => ({ ...prev, qty_total: e.target.value }))}
              style={{ width: 90, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="number"
              placeholder="Qty available"
              value={manual.qty_available}
              onChange={(e) => setManual((prev) => ({ ...prev, qty_available: e.target.value }))}
              style={{ width: 110, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="number"
              placeholder="Cost"
              value={manual.cost}
              onChange={(e) => setManual((prev) => ({ ...prev, cost: e.target.value }))}
              style={{ width: 90, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="Currency"
              value={manual.currency}
              onChange={(e) => setManual((prev) => ({ ...prev, currency: e.target.value }))}
              style={{ width: 90, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Upload header row (0-based)</label>
          <input
            type="number"
            min={0}
            value={uploadHeaderRow}
            onChange={(e) => setUploadHeaderRow(Number(e.target.value) || 0)}
            style={{ width: 120, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {statusLegend.map((s) => (
          <div
            key={s.label}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 12,
              background: 'var(--panel)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 900 }}>{s.label}</div>
            <div style={{ height: 4, borderRadius: 4, background: s.color }} />
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              {loading ? 'Loading…' : counters.byStatus[s.label.toLowerCase()] || 0} items
            </div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '0.3fr 1.3fr 0.8fr 0.8fr 0.9fr 0.9fr 0.8fr',
            gap: 0,
            background: 'var(--surface-2)',
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 10 }}>Select</div>
          <div style={{ padding: 10 }}>Part / Description</div>
          <div style={{ padding: 10 }}>OEM</div>
          <div style={{ padding: 10 }}>Condition</div>
          <div style={{ padding: 10 }}>Qty (avail/total)</div>
          <div style={{ padding: 10 }}>Cost</div>
          <div style={{ padding: 10 }}>Status</div>
        </div>

        {filteredRows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.3fr 1.3fr 0.8fr 0.8fr 0.9fr 0.9fr 0.8fr',
              gap: 0,
              borderTop: `1px solid var(--border)`,
              background: 'var(--panel)',
            }}
          >
            <div style={{ padding: 10 }}>
              <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 900 }}>{r.model || r.description || 'Untitled item'}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.description || 'No description'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {r.specs?.auction ? (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid var(--accent)',
                      color: 'var(--accent)',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    In auction
                  </span>
                ) : null}
              </div>
            </div>
            <div style={{ padding: 10 }}>{r.oem || '—'}</div>
            <div style={{ padding: 10 }}>{r.condition || '—'}</div>
            <div style={{ padding: 10 }}>
              <input
                type="number"
                value={r.qty_available ?? ''}
                placeholder="Available"
                onChange={(e) => updateInventory(r.id, { qty_available: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', marginBottom: 6 }}
              />
              <input
                type="number"
                value={r.qty_total ?? ''}
                placeholder="Total"
                onChange={(e) => updateInventory(r.id, { qty_total: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
            </div>
            <div style={{ padding: 10 }}>
              <input
                type="number"
                value={r.cost ?? ''}
                placeholder="Cost"
                onChange={(e) => updateInventory(r.id, { cost: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{r.currency || 'USD'}</div>
            </div>
            <div style={{ padding: 10 }}>
              <select
                value={r.status ?? 'available'}
                onChange={(e) => updateInventory(r.id, { status: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
              >
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="auction">Auction</option>
                <option value="allocated">Allocated</option>
                <option value="sold">Sold</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="flip">Flip</option>
              </select>
            </div>
          </div>
        ))}

        {loading ? (
          <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12, borderTop: `1px solid var(--border)` }}>Loading inventory…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12, borderTop: `1px solid var(--border)` }}>
            No inventory lines match your filters. Upload an XLSX or add items manually to start tracking stock.
          </div>
        ) : (
          <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12, borderTop: `1px solid var(--border)` }}>
            Showing {filteredRows.length} inventory items.
          </div>
        )}

        {error ? (
          <div style={{ padding: 12, color: 'var(--bad)', fontSize: 12, borderTop: `1px solid var(--border)` }}>{error}</div>
        ) : null}
      </div>
    </main>
  )
}
