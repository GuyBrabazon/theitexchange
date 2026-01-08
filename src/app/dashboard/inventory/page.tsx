'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildSheetFromMatrix, parseSpreadsheetMatrix } from '@/lib/parseSpreadsheet'

type InventoryRow = {
  id: string
  lot_id: string | null
  lot_title: string | null
  status: string | null
  model: string | null
  description: string | null
  qty: number | null
  asking_price: number | null
  cost: number | null
  oem: string | null
  specs: Record<string, unknown> | null
  quoted_price?: number | null
  quoted_customer?: string | null
  quoted_at?: string | null
  auction?: boolean | null
}

type LotOption = { id: string; title: string; status: string | null }

const statusLegend = [
  { label: 'Available', color: 'var(--good)' },
  { label: 'Reserved', color: 'var(--warn)' },
  { label: 'In auction', color: 'var(--accent)' },
  { label: 'Allocated', color: 'var(--info)' },
]

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [lots, setLots] = useState<LotOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [lotFilter, setLotFilter] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState({
    lot_id: '',
    model: '',
    oem: '',
    qty: '',
    ask: '',
    cost: '',
    description: '',
  })
  const [uploadHeaderRow, setUploadHeaderRow] = useState<number>(0)
  const [quotedPrice, setQuotedPrice] = useState<string>('')
  const [quotedCustomer, setQuotedCustomer] = useState<string>('')

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

      const { data: lotsRes, error: lotsErr } = await supabase
        .from('lots')
        .select('id,title,status,tenant_id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (lotsErr) throw lotsErr
      setLots((lotsRes ?? []).map((l) => ({ id: String(l.id), title: l.title ?? 'Untitled lot', status: l.status ?? null })))

      const { data, error: invErr } = await supabase
        .from('line_items')
        .select(
          `
            id,
            lot_id,
            model,
            description,
            qty,
            asking_price,
            cost,
            specs,
            lots (
              title,
              status,
              tenant_id
            )
          `
        )
        .eq('lots.tenant_id', tenantId)
        .limit(500)

      if (invErr) throw invErr

      const mapped: InventoryRow[] =
        (data ?? []).map((row) => {
          const rec = row as Record<string, unknown>
          const lots = rec.lots as Record<string, unknown> | null | undefined
          const specs = rec.specs as Record<string, unknown> | null | undefined

          return {
            id: String(rec.id ?? ''),
            lot_id: (rec.lot_id as string | null) ?? null,
            lot_title: (lots?.title as string | null) ?? null,
            status: (lots?.status as string | null) ?? null,
            model: (rec.model as string | null) ?? (rec.description as string | null) ?? '',
            description: (rec.description as string | null) ?? '',
            qty: typeof rec.qty === 'number' ? rec.qty : rec.qty ? Number(rec.qty) : null,
            asking_price: typeof rec.asking_price === 'number' ? rec.asking_price : rec.asking_price ? Number(rec.asking_price) : null,
            cost: typeof rec.cost === 'number' ? rec.cost : rec.cost ? Number(rec.cost) : null,
            oem: (specs?.oem as string | null) ?? null,
            quoted_price: (specs?.quoted_price as number | null) ?? null,
            quoted_customer: (specs?.quoted_customer as string | null) ?? null,
            quoted_at: (specs?.quoted_at as string | null) ?? null,
            auction: (specs?.auction as boolean | null) ?? null,
            specs: specs ?? null,
          }
        }) ?? []

      setRows(mapped)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load inventory'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const counters = useMemo(() => {
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      const key = (r.status ?? 'available').toLowerCase()
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    return { total: rows.length, byStatus }
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const statusOk = statusFilter === 'all' || (r.status ?? 'available')?.toLowerCase() === statusFilter
      const lotOk = lotFilter === 'all' || r.lot_id === lotFilter
      return statusOk && lotOk
    })
  }, [rows, statusFilter, lotFilter])

  const money = (v: number | null) => (v == null ? '—' : Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(v))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleManualChange = (field: string, value: string) => {
    setManual((prev) => ({ ...prev, [field]: value }))
  }

  const updateLine = async (id: string, patch: Record<string, unknown>) => {
    try {
      setLoading(true)
      const { error: upErr } = await supabase.from('line_items').update(patch).eq('id', id)
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

  const addManual = async () => {
    try {
      setLoading(true)
      const qty = manual.qty ? Number(manual.qty) : null
      const ask = manual.ask ? Number(manual.ask) : null
      const cost = manual.cost ? Number(manual.cost) : null

      const { error: insErr } = await supabase.from('line_items').insert({
        lot_id: manual.lot_id || null,
        model: manual.model || null,
        description: manual.description || manual.model || null,
        qty,
        asking_price: ask,
        cost,
        specs: { oem: manual.oem || null },
      })
      if (insErr) throw insErr
      setManual({ lot_id: '', model: '', oem: '', qty: '', ask: '', cost: '', description: '' })
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to add item'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    try {
      setLoading(true)
      const matrix = await parseSpreadsheetMatrix(file, 500)
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
        const model = mapVal(obj, ['model', 'part', 'description'])
        const oem = mapVal(obj, ['oem', 'manufacturer'])
        const qtyRaw = mapVal(obj, ['qty', 'quantity'])
        const askRaw = mapVal(obj, ['ask', 'asking', 'price', 'asking price'])
        const costRaw = mapVal(obj, ['cost', 'cost price'])

        const qty = qtyRaw ? Number(qtyRaw) : null
        const ask = askRaw ? Number(askRaw) : null
        const cost = costRaw ? Number(costRaw) : null

        return {
          lot_id: manual.lot_id || null,
          model: model ? String(model) : null,
          description: model ? String(model) : null,
          qty,
          asking_price: ask,
          cost,
          specs: { oem: oem ? String(oem) : null },
        }
      })

      const validInserts = inserts.filter((i) => i.model || i.qty || i.asking_price || i.cost)
      if (!validInserts.length) throw new Error('No rows with values found to import')

      const { error: insErr } = await supabase.from('line_items').insert(validInserts)
      if (insErr) throw insErr
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const updateSpecsForSelection = async (patch: Record<string, unknown>) => {
    if (!selectedIds.size) return
    try {
      setLoading(true)
      const updates = Array.from(selectedIds).map((id) => {
        const row = rows.find((r) => r.id === id)
        const specs = row?.specs ?? {}
        return { id, specs: { ...specs, ...patch } }
      })

      const { error: upErr } = await supabase.from('line_items').upsert(
        updates.map((u) => ({ id: u.id, specs: u.specs })),
        { onConflict: 'id' }
      )
      if (upErr) throw upErr
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Update failed'
      setError(msg)
    } finally {
      setLoading(false)
      setSelectedIds(new Set())
    }
  }

  const markAuction = async () => {
    await updateSpecsForSelection({ auction: true })
  }

  const markQuoted = async () => {
    const priceVal = quotedPrice ? Number(quotedPrice) : null
    await updateSpecsForSelection({
      quoted_at: new Date().toISOString(),
      quoted_price: priceVal,
      quoted_customer: quotedCustomer || null,
    })
    setQuotedPrice('')
    setQuotedCustomer('')
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Inventory</h1>
        <div style={{ color: 'var(--muted)', marginBottom: 12 }}>
          Organisation-owned stock with availability, auction, and allocation controls.
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Quoted price"
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="Quoted customer"
              value={quotedCustomer}
              onChange={(e) => setQuotedCustomer(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <button
              onClick={markQuoted}
              disabled={!selectedIds.size}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 900,
                cursor: selectedIds.size ? 'pointer' : 'not-allowed',
              }}
            >
              Mark quoted
            </button>
          </div>
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
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Lot filter</label>
          <select
            value={lotFilter}
            onChange={(e) => setLotFilter(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
          >
            <option value="all">All lots</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
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
              onChange={(e) => handleManualChange('model', e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="text"
              placeholder="OEM"
              value={manual.oem}
              onChange={(e) => handleManualChange('oem', e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="number"
              placeholder="Qty"
              value={manual.qty}
              onChange={(e) => handleManualChange('qty', e.target.value)}
              style={{ width: 80, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="number"
              placeholder="Ask"
              value={manual.ask}
              onChange={(e) => handleManualChange('ask', e.target.value)}
              style={{ width: 90, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <input
              type="number"
              placeholder="Cost"
              value={manual.cost}
              onChange={(e) => handleManualChange('cost', e.target.value)}
              style={{ width: 90, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
            />
            <select
              value={manual.lot_id}
              onChange={(e) => handleManualChange('lot_id', e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
            >
              <option value="">No lot</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
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
            gridTemplateColumns: '0.3fr 1.3fr 0.8fr 0.8fr 0.6fr 0.9fr 0.9fr',
            gap: 0,
            background: 'var(--surface-2)',
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 10 }}>Select</div>
          <div style={{ padding: 10 }}>Part / Description</div>
          <div style={{ padding: 10 }}>OEM</div>
          <div style={{ padding: 10 }}>Lot</div>
          <div style={{ padding: 10 }}>Qty</div>
          <div style={{ padding: 10 }}>Ask / Cost</div>
          <div style={{ padding: 10 }}>Status</div>
        </div>

        {filteredRows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.3fr 1.3fr 0.8fr 0.8fr 0.6fr 0.9fr 0.9fr',
              gap: 0,
              borderTop: `1px solid var(--border)`,
              background: 'var(--panel)',
            }}
          >
            <div style={{ padding: 10 }}>
              <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
            </div>
            <div style={{ padding: 10 }}>
              <div style={{ fontWeight: 900 }}>{r.model || r.description || 'Untitled line'}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.description || 'No description'}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {r.auction ? (
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
                {r.quoted_price !== null && r.quoted_price !== undefined ? (
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 999,
                      border: '1px solid var(--muted)',
                      color: 'var(--text)',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    Quoted {money(r.quoted_price)} {r.quoted_customer ? `to ${r.quoted_customer}` : ''}
                    {r.quoted_at ? ` • ${new Date(r.quoted_at).toLocaleString()}` : ''}
                  </span>
                ) : null}
              </div>
            </div>
            <div style={{ padding: 10 }}>{r.oem || '—'}</div>
            <div style={{ padding: 10 }}>{r.lot_title || 'Unassigned'}</div>
            <div style={{ padding: 10 }}>
              <input
                type="number"
                value={r.qty ?? ''}
                onChange={(e) => updateLine(r.id, { qty: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
            </div>
            <div style={{ padding: 10 }}>
              <input
                type="number"
                value={r.asking_price ?? ''}
                placeholder="Ask"
                onChange={(e) => updateLine(r.id, { asking_price: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', marginBottom: 6 }}
              />
              <input
                type="number"
                value={r.cost ?? ''}
                placeholder="Cost"
                onChange={(e) => updateLine(r.id, { cost: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
            </div>
            <div style={{ padding: 10 }}>{r.status || 'Available'}</div>
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
            Showing {filteredRows.length} line items. Totals and auction controls coming soon.
          </div>
        )}

        {error ? (
          <div style={{ padding: 12, color: 'var(--bad)', fontSize: 12, borderTop: `1px solid var(--border)` }}>{error}</div>
        ) : null}
      </div>
    </main>
  )
}
