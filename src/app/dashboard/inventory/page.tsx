'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { parseSpreadsheetMatrix } from '@/lib/parseSpreadsheet'
import * as XLSX from 'xlsx'

type InventoryRow = {
  id: string
  tenant_id: string
  sid: string | null
  model: string | null
  description: string | null
  oem: string | null
  condition: string | null
  location: string | null
  status: string | null
  category: string | null
  qty_total: number | null
  qty_available: number | null
  cost: number | null
  currency: string | null
  specs: Record<string, unknown> | null
}

type UnitRow = {
  id: string
  unit_sid: string
  status: string
  created_at: string | null
}

const currencyOptions = ['USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'CAD', 'SGD', 'AED']
const categoryOptions = ['server', 'storage', 'networking', 'component', 'pc', 'laptop']

const formatMoney = (value: number | null, currency?: string | null) => {
  if (value == null || Number.isNaN(value)) return '—'
  const cur = currency || 'USD'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(value)
  } catch {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
}

const getExtendedValue = (row: InventoryRow) => {
  const qty = row.qty_available ?? row.qty_total ?? 0
  const unit = row.cost ?? 0
  if (!Number.isFinite(qty) || !Number.isFinite(unit)) return null
  return qty * unit
}

export default function InventoryPage() {
  const router = useRouter()
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [tenantId, setTenantId] = useState<string>('')
  const [tenantCurrency, setTenantCurrency] = useState<string>('USD')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [manual, setManual] = useState({
    model: '',
    description: '',
    oem: '',
    condition: '',
    location: '',
    category: 'component',
    qty_available: '',
    cost: '',
    currency: '',
  })
  const [uploadHeaderRow, setUploadHeaderRow] = useState<number>(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mapOpen, setMapOpen] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState({
    model: '',
    oem: '',
    condition: '',
    category: '',
    quantity: '',
    cost: '',
    status: '',
  })
  const [pendingFileName, setPendingFileName] = useState<string>('')
  const [manualOpen, setManualOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [containedComponents, setContainedComponents] = useState<Array<{ model: string; oem: string; qty: string }>>([
    { model: '', oem: '', qty: '' },
  ])
  const [unitsOpen, setUnitsOpen] = useState(false)
  const [unitsFor, setUnitsFor] = useState<{ id: string; label: string } | null>(null)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [unitsError, setUnitsError] = useState('')

  useEffect(() => {
    if (tenantCurrency) {
      setManual((prev) => ({ ...prev, currency: tenantCurrency }))
    }
  }, [tenantCurrency])

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
      setTenantId(tenantId)

      // Load tenant preferred currency from settings, fallback to tenants.default_currency, then USD
      try {
        const [{ data: settings, error: settingsErr }, { data: tenantRec, error: tenantErr }] = await Promise.all([
          supabase.from('tenant_settings').select('default_currency').eq('tenant_id', tenantId).maybeSingle(),
          supabase.from('tenants').select('default_currency').eq('id', tenantId).maybeSingle(),
        ])
        const cur =
          (!settingsErr && settings?.default_currency) ||
          (!tenantErr && tenantRec?.default_currency) ||
          'USD'
        setTenantCurrency(String(cur))
      } catch {
        setTenantCurrency('USD')
      }

      const { data, error: invErr } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(10000)
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
            sid: row.sid == null ? null : String(row.sid),
            model: (row.model as string | null) ?? null,
            description: (row.description as string | null) ?? null,
            oem: (row.oem as string | null) ?? null,
            condition: (row.condition as string | null) ?? null,
            category: (row.category as string | null) ?? null,
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

  const getParentId = (specs: Record<string, unknown> | null) => {
    const raw = specs ? specs['parent_id'] : null
    return typeof raw === 'string' && raw.trim() ? raw : null
  }

  const parentLabels = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((row) => {
      if (!row.id) return
      const baseLabel = row.model || row.description || row.id
      const label = row.sid ? `${baseLabel} (SID: ${row.sid})` : baseLabel
      map.set(row.id, label)
    })
    return map
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      const statusOk = statusFilter === 'all' || (r.status ?? 'available')?.toLowerCase() === statusFilter
      if (!statusOk) return false
      if (!term) return true
      const hay = [r.model, r.description, r.oem, r.condition, r.sid].map((x) => (x ?? '').toLowerCase())
      return hay.some((h) => h.includes(term))
    })
  }, [rows, statusFilter, search])

  const previewRows = useMemo(() => dataRows.slice(0, 8), [dataRows])

  const insertInventory = async (payloads: Partial<InventoryRow>[]) => {
    if (!tenantId) throw new Error('Tenant not loaded')
      const normalized = payloads.map((p) => ({
        tenant_id: tenantId,
        model: p.model || null,
        description: p.description || p.model || null,
        oem: p.oem || null,
        condition: p.condition || null,
        category: categoryOptions.includes((p.category || '').toString().toLowerCase()) ? (p.category as string) : 'component',
        location: p.location || null,
        status: p.status || 'available',
        qty_total: p.qty_total ?? p.qty_available ?? null,
        qty_available: p.qty_available ?? null,
        cost: p.cost ?? null,
      currency: p.currency || tenantCurrency || 'USD',
      specs: p.specs ?? {},
    }))
    const { error: insErr } = await supabase.from('inventory_items').insert(normalized)
    if (insErr) throw insErr
  }

  const addManual = async () => {
    try {
      setLoading(true)
      const qty_available = manual.qty_available ? Number(manual.qty_available) : null
      const cost = manual.cost ? Number(manual.cost) : null
      const filteredComponents =
        manual.category !== 'component'
          ? containedComponents
              .map((c) => ({
                model: c.model.trim(),
                oem: c.oem.trim(),
                qty: c.qty ? Number(c.qty) : 0,
              }))
              .filter((c) => (c.model || c.oem) && c.qty > 0)
          : []

      if (manual.category !== 'component' && filteredComponents.length > 0) {
        const res = await fetch('/api/inventory/add-with-components', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenantId,
            item: {
              model: manual.model,
              description: manual.description,
              oem: manual.oem,
              condition: manual.condition,
              location: manual.location,
              category: manual.category,
              qty_available,
              cost,
              currency: manual.currency || tenantCurrency || 'USD',
            },
            components: filteredComponents,
          }),
        })
        if (!res.ok) {
          const msg = await res.text()
          throw new Error(msg || 'Failed to add system with components')
        }
      } else {
        await insertInventory([
          {
            model: manual.model,
            description: manual.description,
            oem: manual.oem,
            condition: manual.condition,
            location: manual.location,
            category: manual.category,
            qty_available,
            qty_total: qty_available,
            cost,
            currency: manual.currency || tenantCurrency || 'USD',
          },
        ])
      }
      setManual({
        model: '',
        description: '',
        oem: '',
        condition: '',
        location: '',
        category: 'component',
        qty_available: '',
        cost: '',
        currency: tenantCurrency || 'USD',
      })
      setContainedComponents([{ model: '', oem: '', qty: '' }])
      setManualOpen(false)
      await load()
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to add inventory'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const startUpload = async (file: File) => {
    try {
      setLoading(true)
      setUploadOpen(false)
      setPendingFileName(file.name)
      const matrix = await parseSpreadsheetMatrix(file, 5000)
      const headerRow = matrix[uploadHeaderRow] ?? []
      const rows = matrix.slice(uploadHeaderRow + 1)
      const normalizedHeaders = headerRow.map((h, idx) => {
        const text = String(h ?? '').trim()
        return text || `Column ${idx + 1}`
      })
      setHeaders(normalizedHeaders)
      setDataRows(rows.map((r) => r.map((c) => String(c ?? ''))))

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      const findCol = (keys: string[]) => {
        const candidates = normalizedHeaders.map((h, i) => ({ h, i, norm: normalize(h) }))
        for (const key of keys) {
          const normKey = normalize(key)
          const hit = candidates.find((c) => c.norm.includes(normKey))
          if (hit) return hit.h
        }
        return ''
      }

      setMapping({
        model: findCol(['part', 'model', 'sku', 'description']),
        oem: findCol(['oem', 'manufacturer', 'brand']),
        condition: findCol(['condition']),
        category: findCol(['type', 'category']),
        quantity: findCol(['qty', 'quantity']),
        cost: findCol(['cost', 'price']),
        status: findCol(['status']),
      })
      setMapOpen(true)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const closeMapping = () => {
    setMapOpen(false)
    setPendingFileName('')
    setDataRows([])
  }

  const confirmMapping = async () => {
    try {
      setLoading(true)
      const colIndex = (name: string) => headers.findIndex((h) => h === name)
      const idxModel = colIndex(mapping.model)
      const idxOem = colIndex(mapping.oem)
      const idxCond = colIndex(mapping.condition)
      const idxQty = colIndex(mapping.quantity)
      const idxCat = colIndex(mapping.category)
      const idxCost = colIndex(mapping.cost)
      const idxStatus = colIndex(mapping.status)

      if (idxModel < 0) throw new Error('Please map a part/model column')
      if (!dataRows.length) throw new Error('No data rows detected to import')

      const rowsToUse = dataRows
      const mapped = rowsToUse
        .map((row) => {
          const getVal = (idx: number) => {
            if (idx < 0) return ''
            return (row[idx] ?? '').toString().trim()
          }
          const qtyVal = getVal(idxQty)
          const costVal = getVal(idxCost)
          const statusVal = getVal(idxStatus)
          const catVal = getVal(idxCat)
          const normalizedCat = categoryOptions.includes(catVal.toLowerCase()) ? catVal.toLowerCase() : 'component'
          return {
            model: getVal(idxModel) || null,
            description: getVal(idxModel) || null,
            oem: getVal(idxOem) || null,
            condition: getVal(idxCond) || null,
            category: normalizedCat,
            qty_total: qtyVal ? Number(qtyVal) : null,
            qty_available: qtyVal ? Number(qtyVal) : null,
            cost: costVal ? Number(costVal) : null,
            currency: tenantCurrency || 'USD',
            status: statusVal || 'available',
            specs: {},
          }
        })
        .filter((r) => r.model || r.qty_total || r.cost)

      if (!mapped.length) throw new Error('No rows with values found to import')
      await insertInventory(mapped)
      closeMapping()
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

  const closeUnits = () => {
    setUnitsOpen(false)
    setUnitsFor(null)
    setUnits([])
    setUnitsError('')
  }

  const openUnits = async (row: InventoryRow) => {
    try {
      setUnitsOpen(true)
      setUnitsLoading(true)
      setUnitsError('')
      setUnitsFor({ id: row.id, label: row.model || row.description || row.id })

      const { data, error: unitErr } = await supabase
        .from('inventory_units')
        .select('id,unit_sid,status,created_at')
        .eq('inventory_item_id', row.id)
        .order('created_at', { ascending: true })

      if (unitErr) throw unitErr

      const mapped: UnitRow[] =
        (data ?? []).map((u) => ({
          id: String((u as Record<string, unknown>).id ?? ''),
          unit_sid: String((u as Record<string, unknown>).unit_sid ?? ''),
          status: String((u as Record<string, unknown>).status ?? ''),
          created_at: (u as Record<string, unknown>).created_at
            ? String((u as Record<string, unknown>).created_at)
            : null,
        })) ?? []

      setUnits(mapped)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load unit SIDs'
      setUnitsError(msg)
      setUnits([])
    } finally {
      setUnitsLoading(false)
    }
  }

  const downloadTemplate = () => {
    const headers = [
      'Type',
      'Kind',
      'Model',
      'OEM',
      'Condition',
      'Location',
      'Serial',
      'Qty_available',
      'Cost',
      'Currency',
      'CPU_model',
      'CPU_qty',
      'Memory_model',
      'Memory_qty',
      'NIC_model',
      'NIC_qty',
      'Drive_model',
      'Drive_qty',
      'GPU_model',
      'GPU_qty',
      'Cable_model',
      'Cable_qty',
      'Compat_tags',
    ]

    const ws = XLSX.utils.aoa_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'proforma-stock.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const markAuction = async () => {
    if (!selectedIds.size) return
    if (!tenantId) {
      setError('Tenant not loaded')
      return
    }
    try {
      setLoading(true)
      setError('')

      // Create a new draft lot
      const title = `Auction ${new Date().toLocaleDateString()}`
      const { data: lotRows, error: lotErr } = await supabase
        .from('lots')
        .insert({
          tenant_id: tenantId,
          title,
          type: 'priced',
          status: 'draft',
          currency: tenantCurrency || 'USD',
        })
        .select('id')
        .single()
      if (lotErr) throw lotErr
      const lotId = lotRows.id as string

      // Build line items from selected inventory
      const selected = rows.filter((r) => selectedIds.has(r.id))
      const linePayload = selected.map((r) => ({
        lot_id: lotId,
        description: r.description || r.model || 'Item',
        model: r.model || r.description || 'Item',
        qty: r.qty_available ?? r.qty_total ?? 1,
        asking_price: r.cost ?? 0,
        specs: r.specs ?? {},
        line_ref: r.id,
      }))
      if (linePayload.length) {
        const { error: liErr } = await supabase.from('line_items').insert(linePayload)
        if (liErr) throw liErr
      }

      // Mark inventory as moved to auction and zero available qty
      const { error: invErr } = await supabase
        .from('inventory_items')
        .update({ status: 'auction', qty_available: 0 })
        .in('id', Array.from(selectedIds))
      if (invErr) throw invErr

      // Redirect to the new lot
      router.push(`/dashboard/lots/${lotId}`)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to create auction lot'
      setError(msg)
    } finally {
      setLoading(false)
      setSelectedIds(new Set())
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Inventory</h1>
        <div style={{ color: 'var(--muted)', marginBottom: 12 }}>
          
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
            onClick={() => setUploadOpen(true)}
          >
            Upload XLSX
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
            onClick={() => setManualOpen(true)}
          >
            Add line manually
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
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Search</label>
          <input
            type="text"
            placeholder="Search part / description / OEM / condition"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
          />
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '0.25fr 0.85fr 0.7fr 1.1fr 0.6fr 0.6fr 0.6fr 0.7fr 0.7fr 0.7fr 0.7fr',
            gap: 0,
            background: 'var(--surface-2)',
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 8 }}>Select</div>
          <div style={{ padding: 8 }}>Part number</div>
          <div style={{ padding: 8 }}>SID</div>
          <div style={{ padding: 8 }}>Description</div>
          <div style={{ padding: 8 }}>OEM</div>
          <div style={{ padding: 8 }}>Condition</div>
          <div style={{ padding: 8 }}>Category</div>
          <div style={{ padding: 8 }}>Available QTY</div>
          <div style={{ padding: 8 }}>Cost</div>
          <div style={{ padding: 8 }}>Extended value</div>
          <div style={{ padding: 8 }}>Status</div>
        </div>

        {filteredRows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '0.25fr 0.85fr 0.7fr 1.1fr 0.6fr 0.6fr 0.6fr 0.7fr 0.7fr 0.7fr 0.7fr',
              gap: 0,
              borderTop: `1px solid var(--border)`,
              background: 'var(--panel)',
            }}
          >
            <div style={{ padding: 8 }}>
              <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
            </div>
            <div style={{ padding: 8, fontWeight: 900 }}>{r.model || 'Untitled item'}</div>
            <div style={{ padding: 8, display: 'grid', gap: 6 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.sid || '-'}</div>
              {(r.qty_available ?? 0) > 1 ? (
                <button
                  onClick={() => openUnits(r)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  View unit SIDs
                </button>
              ) : null}
            </div>
            <div style={{ padding: 8, color: 'var(--muted)', fontSize: 12 }}>
              {r.description || 'No description'}
              {r.category?.toLowerCase() === 'component' && getParentId(r.specs) ? (
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  Installed in: {parentLabels.get(getParentId(r.specs) as string) || getParentId(r.specs)}
                </div>
              ) : null}
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
            <div style={{ padding: 8 }}>{r.oem || '-'}</div>
            <div style={{ padding: 8 }}>{r.condition || '-'}</div>
            <div style={{ padding: 8 }}>{r.category || 'component'}</div>
            <div style={{ padding: 8 }}>
              <input
                type="number"
                value={r.qty_available ?? ''}
                placeholder="Available"
                onChange={(e) => updateInventory(r.id, { qty_available: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
            </div>
            <div style={{ padding: 8 }}>
              <input
                type="number"
                value={r.cost ?? ''}
                placeholder="Cost"
                onChange={(e) => updateInventory(r.id, { cost: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{r.currency || 'USD'}</div>
            </div>
            <div style={{ padding: 8 }}>
              <div style={{ fontWeight: 700 }}>{formatMoney(getExtendedValue(r), r.currency)}</div>
            </div>
            <div style={{ padding: 8 }}>
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

      {mapOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              width: 'min(960px, 90vw)',
              maxHeight: '85vh',
              overflow: 'auto',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Map columns for {pendingFileName || 'upload'}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  Choose which column maps to each field. Status defaults to &quot;available&quot; if not mapped.
                </div>
              </div>
              <button
                onClick={closeMapping}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {[
                { key: 'model', label: 'Part number / Model', required: true },
                { key: 'oem', label: 'OEM' },
                { key: 'condition', label: 'Condition' },
                { key: 'category', label: 'Type / Category' },
                { key: 'quantity', label: 'Quantity (available)' },
                { key: 'cost', label: 'Cost' },
                { key: 'status', label: 'Status' },
              ].map((field) => (
                <div key={field.key} style={{ display: 'grid', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </label>
                  <select
                    value={(mapping as Record<string, string>)[field.key] ?? ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
                  >
                    <option value="">Select column</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td colSpan={headers.length || 1} style={{ padding: 10, color: 'var(--muted)' }}>
                        No data rows detected after the selected header row.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row, idx) => (
                      <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                        {headers.map((_, cIdx) => (
                          <td key={`${idx}-${cIdx}`} style={{ padding: 8 }}>
                            {row[cIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={closeMapping}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmMapping}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--accent)',
                  color: 'white',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Import rows
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              width: 'min(760px, 92vw)',
              maxHeight: '85vh',
              overflow: 'auto',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Add inventory line</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Single line entry for quick captures.</div>
              </div>
              <button
                onClick={() => setManualOpen(false)}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Model / Part number</span>
                <input
                  type="text"
                  placeholder="Model/Part"
                  value={manual.model}
                  onChange={(e) => setManual((prev) => ({ ...prev, model: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Description</span>
                <input
                  type="text"
                  placeholder="Description"
                  value={manual.description}
                  onChange={(e) => setManual((prev) => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>OEM</span>
                <input
                  type="text"
                  placeholder="OEM"
                  value={manual.oem}
                  onChange={(e) => setManual((prev) => ({ ...prev, oem: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Condition</span>
                <input
                  type="text"
                  placeholder="Condition"
                  value={manual.condition}
                  onChange={(e) => setManual((prev) => ({ ...prev, condition: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Location</span>
                <input
                  type="text"
                  placeholder="Location"
                  value={manual.location}
                  onChange={(e) => setManual((prev) => ({ ...prev, location: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Category</span>
                <select
                  value={manual.category}
                  onChange={(e) => setManual((prev) => ({ ...prev, category: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
                >
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              {manual.category !== 'component' ? (
                <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div style={{ fontWeight: 900 }}>Contained components (optional)</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                    Add parts inside this system. Components are created as separate inventory items and linked to the system.
                  </div>
                  {containedComponents.map((c, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Component model/part"
                        value={c.model}
                        onChange={(e) =>
                          setContainedComponents((prev) => prev.map((row, i) => (i === idx ? { ...row, model: e.target.value } : row)))
                        }
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                      />
                      <input
                        type="text"
                        placeholder="OEM"
                        value={c.oem}
                        onChange={(e) =>
                          setContainedComponents((prev) => prev.map((row, i) => (i === idx ? { ...row, oem: e.target.value } : row)))
                        }
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                      />
                      <input
                        type="number"
                        placeholder="Qty"
                        value={c.qty}
                        onChange={(e) =>
                          setContainedComponents((prev) => prev.map((row, i) => (i === idx ? { ...row, qty: e.target.value } : row)))
                        }
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                      />
                      <button
                        onClick={() => setContainedComponents((prev) => prev.filter((_, i) => i !== idx))}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-2)',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      onClick={() => setContainedComponents((prev) => [...prev, { model: '', oem: '', qty: '' }])}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      Add component
                    </button>
                  </div>
                </div>
              ) : null}
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Available QTY</span>
                <input
                  type="number"
                  placeholder="Available QTY"
                  value={manual.qty_available}
                  onChange={(e) => setManual((prev) => ({ ...prev, qty_available: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Cost</span>
                <input
                  type="number"
                  placeholder="Cost"
                  value={manual.cost}
                  onChange={(e) => setManual((prev) => ({ ...prev, cost: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Currency</span>
                <select
                  value={manual.currency || tenantCurrency || 'USD'}
                  onChange={(e) => setManual((prev) => ({ ...prev, currency: e.target.value }))}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
                >
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setManualOpen(false)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={addManual}
                disabled={loading}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Saving…' : 'Add line'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {uploadOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 25,
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              width: 'min(760px, 92vw)',
              maxHeight: '85vh',
              overflow: 'auto',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Upload XLSX</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Download the proforma, fill it in, then upload and map columns.
                </div>
              </div>
              <button
                onClick={() => setUploadOpen(false)}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={downloadTemplate}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Download Proforma Stock XLSX
              </button>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                Headers: Type, Kind, Model, OEM, Condition, Location, Serial, Qty_available, Cost, Currency, CPU/Memory/NIC/Drive/GPU/Cable fields, Compat_tags.
              </div>
            </div>

            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 900 }}>Select file to import</div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Header row (0-based)</span>
                <input
                  type="number"
                  min={0}
                  value={uploadHeaderRow}
                  onChange={(e) => setUploadHeaderRow(Number(e.target.value) || 0)}
                  style={{ width: 160, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                />
              </label>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) startUpload(file)
                  e.target.value = ''
                }}
              />
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                After choosing a file, you&apos;ll be asked to map columns before import.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {unitsOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 26,
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 16,
              width: 'min(720px, 92vw)',
              maxHeight: '85vh',
              overflow: 'auto',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Unit SIDs</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {unitsFor ? `Inventory item: ${unitsFor.label}` : 'Inventory item'}
                </div>
              </div>
              <button
                onClick={closeUnits}
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            {unitsLoading ? (
              <div style={{ padding: 10, color: 'var(--muted)', fontSize: 12 }}>Loading unit SIDs...</div>
            ) : units.length === 0 ? (
              <div style={{ padding: 10, color: 'var(--muted)', fontSize: 12 }}>
                No unit SIDs found for this item.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 0.6fr 0.8fr',
                    gap: 0,
                    background: 'var(--surface-2)',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  <div style={{ padding: 8 }}>Unit SID</div>
                  <div style={{ padding: 8 }}>Status</div>
                  <div style={{ padding: 8 }}>Created</div>
                </div>
                {units.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.6fr 0.8fr',
                      gap: 0,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ padding: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{u.unit_sid}</div>
                    <div style={{ padding: 8, fontSize: 12 }}>{u.status}</div>
                    <div style={{ padding: 8, fontSize: 12 }}>
                      {u.created_at ? new Date(u.created_at).toLocaleString() : '-'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {unitsError ? (
              <div style={{ padding: 10, color: 'var(--bad)', fontSize: 12 }}>{unitsError}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}
