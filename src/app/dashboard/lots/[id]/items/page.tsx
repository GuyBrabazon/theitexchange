'use client'

import Link from 'next/link'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { buildLotExportRows, exportRowsToCsv, exportRowsToXlsx } from '@/lib/exportLot'
import { useVirtualizer } from '@tanstack/react-virtual'

type Lot = {
  id: string
  title: string | null
  type: string
  status: string
  currency: string | null
}

type LineItem = {
  id: string
  lot_id: string
  description: string | null
  qty: number | null
  asking_price: number | null

  serial_tag: string | null
  model: string | null
  cpu: string | null
  cpu_qty: number | null
  memory_part_numbers: string | null
  memory_qty: number | null
  network_card: string | null
  expansion_card: string | null
  gpu: string | null

  specs: Record<string, unknown> | null
}

function isPresent(v: unknown) {
  return String(v ?? '').trim() !== ''
}

function formatCpu(li: LineItem) {
  if (!li.cpu) return null
  const qty = li.cpu_qty ? ` x${li.cpu_qty}` : ''
  return `${li.cpu}${qty}`
}

function formatMemory(li: LineItem) {
  const qty = li.memory_qty ? `${li.memory_qty} DIMMs` : ''
  const pn = li.memory_part_numbers ? li.memory_part_numbers : ''
  if (!qty && !pn) return null
  return [pn, qty].filter(Boolean).join(' • ')
}

function formatMoney(val: number | null | undefined, currency: string | null | undefined) {
  if (val === null || val === undefined) return '—'
  return `${val.toLocaleString()} ${currency ?? ''}`.trim()
}

function detailList(li: LineItem) {
  const specs = li.specs && typeof li.specs === 'object' ? li.specs : {}
  const drives = typeof specs?.drives === 'string' ? specs.drives : null
  const drivesQty = typeof specs?.drives_qty === 'number' ? specs.drives_qty : null
  const maybe = (v: unknown, alt = '—') => (isPresent(v) ? String(v) : alt)

  return [
    { label: 'CPU', value: formatCpu(li) ?? '—' },
    { label: 'CPU QTY', value: li.cpu_qty ?? '—' },
    { label: 'Memory', value: formatMemory(li) ?? '—' },
    { label: 'Memory QTY', value: li.memory_qty ?? '—' },
    { label: 'Network', value: maybe(li.network_card) },
    { label: 'Expansion', value: maybe(li.expansion_card) },
    { label: 'GPU', value: maybe(li.gpu) },
    { label: 'Drives', value: maybe(drives) },
    { label: 'Drives QTY', value: drivesQty ?? '—' },
  ]
}

async function logAvailableParts(
  items: Array<
    Pick<
      LineItem,
      'id' | 'lot_id' | 'cpu' | 'cpu_qty' | 'memory_part_numbers' | 'memory_qty' | 'gpu' | 'specs'
    >
  >
) {
  for (const it of items) {
    const specs = it.specs && typeof it.specs === 'object' ? it.specs : {}
    const drives = typeof specs?.drives === 'string' ? specs.drives : null
    const drivesQty = typeof specs?.drives_qty === 'number' ? specs.drives_qty : null
    const gpuQty = typeof specs?.gpu_qty === 'number' ? specs.gpu_qty : null

    try {
      if (it.cpu) {
        await supabase.rpc('log_part_observation', {
          p_part_number: it.cpu,
          p_category: 'cpu',
          p_qty: it.cpu_qty ?? 1,
          p_qty_type: 'available',
          p_lot: it.lot_id,
          p_line: it.id,
          p_source: 'manual_add',
        })
      }
      if (it.memory_part_numbers) {
        await supabase.rpc('log_part_observation', {
          p_part_number: it.memory_part_numbers,
          p_category: 'memory',
          p_qty: it.memory_qty ?? 1,
          p_qty_type: 'available',
          p_lot: it.lot_id,
          p_line: it.id,
          p_source: 'manual_add',
        })
      }
      if (it.gpu) {
        await supabase.rpc('log_part_observation', {
          p_part_number: it.gpu,
          p_category: 'gpu',
          p_qty: gpuQty ?? 1,
          p_qty_type: 'available',
          p_lot: it.lot_id,
          p_line: it.id,
          p_source: 'manual_add',
        })
      }
      if (drives) {
        await supabase.rpc('log_part_observation', {
          p_part_number: drives,
          p_category: 'drive',
          p_qty: drivesQty ?? 1,
          p_qty_type: 'available',
          p_lot: it.lot_id,
          p_line: it.id,
          p_source: 'manual_add',
        })
      }
    } catch (e) {
      console.warn('part tracking skipped (manual add)', e)
    }
  }
}

export default function LotItemsPage() {
  const params = useParams()
  const id = params.id as string

  const [lot, setLot] = useState<Lot | null>(null)

  // Server-side list state
  const [rows, setRows] = useState<LineItem[]>([])
  const [total, setTotal] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  // Paging + search
  const [page, setPage] = useState(1)
  const pageSize = 100

  const [search, setSearch] = useState('')
  const searchTrimmed = search.trim()
  const [showSpecs, setShowSpecs] = useState(false)

  // manual add
  const [description, setDescription] = useState('')
  const [qty, setQty] = useState<number>(1)
  const [price, setPrice] = useState<string>('')
  const [gpuPn, setGpuPn] = useState('')
  const [gpuQty, setGpuQty] = useState<string>('')
  const [drivePn, setDrivePn] = useState('')
  const [driveQty, setDriveQty] = useState<string>('')

  // Export mode toggle
  const [exportMode, setExportMode] = useState<'page' | 'all'>('page')
  const [exporting, setExporting] = useState(false)

  const currency = lot?.currency ?? 'USD'
  const safeTitle = (lot?.title ?? 'lot').replace(/[^\w\-]+/g, '_').slice(0, 60)

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / pageSize)), [total])

  const loadLot = useCallback(async () => {
    const { data: lotData, error: lotErr } = await supabase
      .from('lots')
      .select('id,title,type,status,currency')
      .eq('id', id)
      .single()

    if (lotErr) {
      alert(lotErr.message)
      return
    }
    setLot(lotData as Lot)
  }, [id])

  const buildQuery = useCallback(() => {
    let q = supabase
      .from('line_items')
      .select(
        `
        id,lot_id,description,qty,asking_price,
        serial_tag,model,cpu,cpu_qty,memory_part_numbers,memory_qty,
        network_card,expansion_card,gpu,
        specs
      `,
        { count: 'exact' }
      )
      .eq('lot_id', id)

    if (searchTrimmed) {
      const term = searchTrimmed.replaceAll('%', '\\%').replaceAll(',', '\\,')
      q = q.or(
        [
          `description.ilike.%${term}%`,
          `model.ilike.%${term}%`,
          `serial_tag.ilike.%${term}%`,
          `cpu.ilike.%${term}%`,
          `memory_part_numbers.ilike.%${term}%`,
          `network_card.ilike.%${term}%`,
          `expansion_card.ilike.%${term}%`,
          `gpu.ilike.%${term}%`,
        ].join(',')
      )
    }

    q = q.order('id', { ascending: false })
    return q
  }, [id, searchTrimmed])

  const loadPage = useCallback(
    async (nextPage: number) => {
      setLoading(true)
      try {
        const from = (nextPage - 1) * pageSize
        const to = from + pageSize - 1

        const query = buildQuery().range(from, to)

        const { data, error, count } = await query
        if (error) throw error

        setRows((data as LineItem[]) ?? [])
        setTotal(count ?? 0)
        setPage(nextPage)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load items'
        alert(msg)
      } finally {
        setLoading(false)
      }
    },
    [buildQuery, pageSize]
  )

  useEffect(() => {
    loadLot().catch((e) => {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load lot'
      alert(msg)
    })
  }, [loadLot])

  useEffect(() => {
    const t = setTimeout(() => {
      loadPage(1)
    }, 250)
    return () => clearTimeout(t)
  }, [loadPage, searchTrimmed])

  useEffect(() => {
    loadPage(1)
  }, [loadPage])

  const addItem = async () => {
    const asking_price = price.trim() === '' ? null : Number(price)
    const gpuQtyNum = gpuQty.trim() === '' ? null : Number(gpuQty)
    const drivesQtyNum = driveQty.trim() === '' ? null : Number(driveQty)

    const specs: Record<string, unknown> = {}
    if (drivePn.trim()) specs.drives = drivePn.trim()
    if (drivesQtyNum != null && Number.isFinite(drivesQtyNum)) specs.drives_qty = drivesQtyNum
    if (gpuPn.trim()) specs.gpu_pn = gpuPn.trim()
    if (gpuQtyNum != null && Number.isFinite(gpuQtyNum)) specs.gpu_qty = gpuQtyNum

    const { data, error } = await supabase
      .from('line_items')
      .insert({
        lot_id: id,
        description,
        qty,
        asking_price,
        gpu: gpuPn.trim() || null,
        specs: Object.keys(specs).length ? specs : null,
      })
      .select('id,lot_id,cpu,cpu_qty,memory_part_numbers,memory_qty,gpu,specs')
    if (error) return alert(error.message)

    const insertedItems = (data as Array<{
      id: string
      lot_id: string | null
      cpu: string | null
      cpu_qty: number | null
      memory_part_numbers: string | null
      memory_qty: number | null
      gpu: string | null
      specs: Record<string, unknown> | null
    }> | null)?.map((row) => ({
      ...row,
      lot_id: row.lot_id ?? id,
    })) ?? []

    await logAvailableParts(insertedItems as Array<{
      id: string
      lot_id: string
      cpu: string | null
      cpu_qty: number | null
      memory_part_numbers: string | null
      memory_qty: number | null
      gpu: string | null
      specs: Record<string, unknown> | null
    }>)

    setDescription('')
    setQty(1)
    setPrice('')
    setGpuPn('')
    setGpuQty('')
    setDrivePn('')
    setDriveQty('')

    await loadPage(page)
  }

  const fetchAllForExport = async (): Promise<LineItem[]> => {
    const all: LineItem[] = []
    const chunk = 1000
    let from = 0

    while (true) {
      const to = from + chunk - 1
      const { data, error } = await buildQuery().range(from, to)
      if (error) throw error
      const batch = (data as LineItem[]) ?? []
      all.push(...batch)
      if (batch.length < chunk) break
      from += chunk
    }
    return all
  }

  const exportCsv = async () => {
    try {
      setExporting(true)
      const items = exportMode === 'page' ? rows : await fetchAllForExport()
      if (!items.length) return alert('No line items to export.')
      const outRows = buildLotExportRows(items, currency)
      exportRowsToCsv(outRows, `buyer_pack_${safeTitle}_${id}.csv`)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to export CSV'
      alert(msg)
    } finally {
      setExporting(false)
    }
  }

  const exportXlsx = async () => {
    try {
      setExporting(true)
      const items = exportMode === 'page' ? rows : await fetchAllForExport()
      if (!items.length) return alert('No line items to export.')
      const outRows = buildLotExportRows(items, currency)
      exportRowsToXlsx(outRows, `buyer_pack_${safeTitle}_${id}.xlsx`, 'Line Items')
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to export XLSX'
      alert(msg)
    } finally {
      setExporting(false)
    }
  }

  // ---- Virtualization ----
  const parentRef = useRef<HTMLDivElement | null>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (showSpecs ? 240 : 150),
    overscan: 8,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  const btnStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: 'var(--text)',
    fontWeight: 900,
    cursor: 'pointer',
  }

  const inputStyle: React.CSSProperties = {
    padding: 10,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: 'var(--text)',
    fontWeight: 850,
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{lot?.title ?? 'Lot'}</h1>
          <div style={{ color: 'var(--muted)' }}>Items • {lot?.type} • {lot?.status} • {currency}</div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={`/dashboard/lots/${id}`}>Summary</Link>
          <Link href={`/dashboard/lots/${id}/invite`}>Invite</Link>
          <Link href={`/dashboard/lots/${id}/offers`}>Offers</Link>
          <Link href={`/dashboard/lots/${id}/import`}>Import</Link>
        </div>
      </div>

      <hr style={{ margin: '18px 0', borderColor: 'var(--border)' }} />

      {/* Sticky toolbar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--bg)',
          padding: '10px 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Server-side search (model, CPU, serial, part numbers...)"
            style={{ ...inputStyle, width: 440 }}
          />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--muted)', fontWeight: 850 }}>
            <input type="checkbox" checked={showSpecs} onChange={(e) => setShowSpecs(e.target.checked)} />
            Show specs
          </label>

          <div style={{ color: 'var(--muted)' }}>
            Page <b style={{ color: 'var(--text)' }}>{page}</b> / <b style={{ color: 'var(--text)' }}>{totalPages}</b> • Showing{' '}
            <b style={{ color: 'var(--text)' }}>{rows.length}</b> of <b style={{ color: 'var(--text)' }}>{total}</b> {loading ? '• loading...' : ''}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <select
              value={exportMode}
              onChange={(e) => setExportMode(e.target.value as 'page' | 'all')}
              style={{ ...inputStyle, padding: 10 }}
            >
              <option value="page">Export current page</option>
              <option value="all">Export ALL items</option>
            </select>
            <button onClick={exportCsv} disabled={exporting} style={{ ...btnStyle, opacity: exporting ? 0.65 : 1 }}>
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button onClick={exportXlsx} disabled={exporting} style={{ ...btnStyle, opacity: exporting ? 0.65 : 1 }}>
              {exporting ? 'Exporting...' : 'Export XLSX'}
            </button>
          </div>
        </div>

        {/* Pager */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => loadPage(1)} disabled={loading || page === 1} style={btnStyle}>
            First
          </button>
          <button onClick={() => loadPage(Math.max(1, page - 1))} disabled={loading || page === 1} style={btnStyle}>
            Prev
          </button>
          <button
            onClick={() => loadPage(Math.min(totalPages, page + 1))}
            disabled={loading || page >= totalPages}
            style={btnStyle}
          >
            Next
          </button>
          <button onClick={() => loadPage(totalPages)} disabled={loading || page >= totalPages} style={btnStyle}>
            Last
          </button>

          <div style={{ color: 'var(--muted)', marginLeft: 6 }}>Page size: {pageSize}</div>
        </div>
      </div>

      <h2 style={{ marginTop: 18 }}>Line items</h2>

      {/* Virtual list container */}
      <div
        ref={parentRef}
        style={{
          height: 720,
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 14,
          marginTop: 12,
          background: 'rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ height: totalSize, position: 'relative' }}>
          {virtualItems.map((v) => {
            const it = rows[v.index]
            if (!it) return null

            const ask = formatMoney(it.asking_price, currency)

            const specsObj = it.specs && typeof it.specs === 'object' ? it.specs : null
            const meta = specsObj?._meta as { source_file?: string; header_row?: number } | undefined
            const specsKeys = specsObj ? Object.keys(specsObj).filter((k) => k !== '_meta') : []
            const details = detailList(it)

            return (
              <div
                key={it.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${v.start}px)`,
                  padding: 10,
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 14,
                    padding: 12,
                    background: 'var(--panel)',
                    boxShadow: 'var(--shadow)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ fontWeight: 950, fontSize: 16 }}>
                        {it.model ? it.model : it.description ?? '(no description)'}
                      </div>

                      {it.description && it.model && it.description !== it.model ? (
                        <div style={{ color: 'var(--muted)', marginTop: 2 }}>{it.description}</div>
                      ) : null}

                      <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Qty</div>
                          <div style={{ fontWeight: 900 }}>{it.qty ?? '-'}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Ask</div>
                          <div style={{ fontWeight: 900 }}>{ask}</div>
                        </div>

                        {isPresent(it.serial_tag) ? (
                          <div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Serial / Tag</div>
                            <div style={{ fontWeight: 900 }}>{it.serial_tag}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 320 }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {details.map((d) => (
                          <div key={d.label}>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.label}</div>
                            <div style={{ fontWeight: 900 }}>{d.value}</div>
                          </div>
                        ))}
                      </div>

                      {showSpecs ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                            Specs {meta ? <span>- source: {meta?.source_file ?? 'unknown'} - header row: {meta?.header_row ?? 'n/a'}</span> : null}
                          </div>

                          {specsObj && specsKeys.length > 0 ? (
                            <div
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 12,
                                padding: 10,
                                background: 'rgba(0,0,0,0.08)',
                                overflowX: 'auto',
                              }}
                            >
                              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                <tbody>
                                  {specsKeys.slice(0, 24).map((k) => (
                                    <tr key={k}>
                                      <td
                                        style={{
                                          borderBottom: '1px solid var(--border)',
                                          padding: '6px 8px',
                                          whiteSpace: 'nowrap',
                                          fontSize: 12,
                                          color: 'var(--muted)',
                                          width: 220,
                                          verticalAlign: 'top',
                                        }}
                                      >
                                        {k}
                                      </td>
                                      <td style={{ borderBottom: '1px solid var(--border)', padding: '6px 8px', fontSize: 12 }}>
                                        {String(specsObj[k])}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {specsKeys.length > 24 ? (
                                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                                  Showing first 24 spec fields (there are {specsKeys.length}).
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--muted)' }}>(No extra specs captured)</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <hr style={{ margin: '20px 0', borderColor: 'var(--border)' }} />

      <h2>Add line item (manual)</h2>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, width: 360 }}
        />
        <input
          placeholder="Qty"
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          style={{ ...inputStyle, width: 120 }}
        />
        <input
          placeholder="Asking price (optional)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ ...inputStyle, width: 240 }}
        />
        <input
          placeholder="GPU part number"
          value={gpuPn}
          onChange={(e) => setGpuPn(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        />
        <input
          placeholder="GPU qty"
          type="number"
          value={gpuQty}
          onChange={(e) => setGpuQty(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <input
          placeholder="Drive part number"
          value={drivePn}
          onChange={(e) => setDrivePn(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        />
        <input
          placeholder="Drive qty"
          type="number"
          value={driveQty}
          onChange={(e) => setDriveQty(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <button onClick={addItem} style={btnStyle}>
          Add
        </button>
      </div>
    </main>
  )
}
