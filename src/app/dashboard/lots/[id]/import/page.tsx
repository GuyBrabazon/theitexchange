'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'
import {
  buildSheetFromMatrix,
  parseSpreadsheetMatrix,
  type ParsedSheet,
} from '@/lib/parseSpreadsheet'

type Lot = {
  id: string
  title: string | null
  type: string
  status: string
  currency: string | null
}

type MappingJson = {
  headerRow?: number

  // Existing
  description?: string
  qty?: string
  price?: string

  // Buyer-facing fields
  serial_tag?: string
  model?: string
  cpu?: string
  cpu_qty?: string
  memory_part_numbers?: string[] // multiple columns
  memory_qty?: string
  network_card?: string
  expansion_card?: string
  gpu?: string
}

type ImportTemplate = {
  id: string
  tenant_id: string
  name: string
  mapping: MappingJson
  updated_at?: string
}

function normalizeHeader(h: string) {
  return String(h ?? '').trim()
}

function parseIntOrNull(v: unknown): number | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return null
  const t = Math.trunc(n)
  return Number.isFinite(t) ? t : null
}

function parseMoneyOrNull(v: unknown): number | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function toQtyOrDefault(v: unknown, fallback = 1): number {
  const n = parseIntOrNull(v)
  if (n === null) return fallback
  return n <= 0 ? fallback : n
}

function isNonEmpty(value: unknown) {
  const s = String(value ?? '').trim()
  return s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined'
}

async function logAvailableParts(
  items: Array<{
    id: string
    lot_id: string | null
    cpu: string | null
    cpu_qty: number | null
    memory_part_numbers: string | null
    memory_qty: number | null
    gpu: string | null
    specs: Record<string, unknown> | null
  }>
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
          p_source: 'import',
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
          p_source: 'import',
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
          p_source: 'import',
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
          p_source: 'import',
        })
      }
    } catch (e) {
      // Best effort; do not block imports
      console.warn('part tracking skipped (import)', e)
    }
  }
}

export default function LotImportPage() {
  const params = useParams()
  const id = params.id as string

  const [lot, setLot] = useState<Lot | null>(null)

  // Tenant context (for templates)
  const [tenantId, setTenantId] = useState<string>('')

  // Templates
  const [templates, setTemplates] = useState<ImportTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateName, setTemplateName] = useState<string>('')

  // File + matrix
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [parseError, setParseError] = useState<string>('')

  // Preview matrix for fast header-row switching
  const [previewMatrix, setPreviewMatrix] = useState<unknown[][]>([])
  // Header row selection (1-based)
  const [headerRow, setHeaderRow] = useState<number>(1)

  // Derived preview based on headerRow
  const preview: ParsedSheet | null = useMemo(() => {
    if (!previewMatrix || previewMatrix.length === 0) return null
    return buildSheetFromMatrix(previewMatrix, Math.max(0, headerRow - 1))
  }, [previewMatrix, headerRow])

  const headers = preview?.headers ?? []

  // Mapping (existing)
  const [mapDescription, setMapDescription] = useState<string>('')
  const [mapQty, setMapQty] = useState<string>('')
  const [mapPrice, setMapPrice] = useState<string>('')

  // Mapping (buyer-facing)
  const [mapSerialTag, setMapSerialTag] = useState<string>('')
  const [mapModel, setMapModel] = useState<string>('')
  const [mapCpu, setMapCpu] = useState<string>('')
  const [mapCpuQty, setMapCpuQty] = useState<string>('')
  const [mapMemoryPNCols, setMapMemoryPNCols] = useState<string[]>([]) // multiple columns
  const [mapMemoryQty, setMapMemoryQty] = useState<string>('')
  const [mapNetworkCard, setMapNetworkCard] = useState<string>('')
  const [mapExpansionCard, setMapExpansionCard] = useState<string>('')
  const [mapGpu, setMapGpu] = useState<string>('')

  const [importing, setImporting] = useState(false)

  const loadLot = useCallback(async () => {
    const { data, error } = await supabase
      .from('lots')
      .select('id,title,type,status,currency')
      .eq('id', id)
      .single()

    if (error) {
      alert(error.message)
      return
    }
    setLot(data as Lot)
  }, [id])

  const loadTemplates = useCallback(async (tid: string) => {
    const { data, error } = await supabase
      .from('import_mappings')
      .select('id,tenant_id,name,mapping,updated_at')
      .eq('tenant_id', tid)
      .order('updated_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setTemplates((data as ImportTemplate[]) ?? [])
  }, [])

  useEffect(() => {
    loadLot()

    const init = async () => {
      try {
        const profile = await ensureProfile()
        setTenantId(profile.tenant_id)
        await loadTemplates(profile.tenant_id)
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load profile/templates'
        alert(msg)
      }
    }

    init()
  }, [id, loadLot, loadTemplates])

  const resetMapping = () => {
    setMapDescription('')
    setMapQty('')
    setMapPrice('')

    setMapSerialTag('')
    setMapModel('')
    setMapCpu('')
    setMapCpuQty('')
    setMapMemoryPNCols([])
    setMapMemoryQty('')
    setMapNetworkCard('')
    setMapExpansionCard('')
    setMapGpu('')

    setSelectedTemplateId('')
    setTemplateName('')
  }

  const handleFileChange = async (file: File | null) => {
    setParseError('')
    setPreviewMatrix([])
    setHeaderRow(1)
    resetMapping()

    setSelectedFile(file)

    if (!file) {
      setSelectedFileName('')
      return
    }

    setSelectedFileName(file.name)
    setUploading(true)

    try {
      // Preview matrix only (first 80 rows so you can pick header rows beyond 20)
      const matrix = await parseSpreadsheetMatrix(file, 80)
      setPreviewMatrix(matrix)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to parse file'
      setParseError(msg)
    } finally {
      setUploading(false)
    }
  }

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) ?? null
  }, [templates, selectedTemplateId])

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const t = templates.find((x) => x.id === templateId)
    if (!t) return

    const hr = Number(t.mapping.headerRow)
    if (Number.isFinite(hr) && hr >= 1) setHeaderRow(hr)

    setMapDescription(t.mapping.description ?? '')
    setMapQty(t.mapping.qty ?? '')
    setMapPrice(t.mapping.price ?? '')

    setMapSerialTag(t.mapping.serial_tag ?? '')
    setMapModel(t.mapping.model ?? '')
    setMapCpu(t.mapping.cpu ?? '')
    setMapCpuQty(t.mapping.cpu_qty ?? '')
    setMapMemoryPNCols(Array.isArray(t.mapping.memory_part_numbers) ? t.mapping.memory_part_numbers : [])
    setMapMemoryQty(t.mapping.memory_qty ?? '')
    setMapNetworkCard(t.mapping.network_card ?? '')
    setMapExpansionCard(t.mapping.expansion_card ?? '')
    setMapGpu(t.mapping.gpu ?? '')

    setTemplateName(t.name)
  }

  // Auto-suggest mapping defaults when preview changes (only if user hasn't selected a template)
  useEffect(() => {
    if (!preview || preview.headers.length === 0) return
    if (selectedTemplateId) return

    const findHeader = (candidates: string[]) =>
      preview.headers.find((h) =>
        candidates.some((c) => normalizeHeader(h).toLowerCase().includes(c))
      ) ?? ''

    setMapDescription((prev) => prev || findHeader(['desc', 'description', 'item', 'product', 'part']))
    setMapQty((prev) => prev || findHeader(['qty', 'quantity', 'count', 'units']))
    setMapPrice((prev) => prev || findHeader(['price', 'ask', 'asking', 'unit price', 'cost']))

    setMapSerialTag((prev) => prev || findHeader(['serial', 'service tag', 'svctag', 'tag']))
    setMapModel((prev) => prev || findHeader(['model', 'chassis', 'system']))
    setMapCpu((prev) => prev || findHeader(['cpu', 'processor']))
    setMapCpuQty((prev) => prev || findHeader(['cpu qty', 'cpu count', 'processors']))
    setMapMemoryQty((prev) => prev || findHeader(['dimm qty', 'memory qty', 'dimm count', 'mem qty']))
    setMapNetworkCard((prev) => prev || findHeader(['nic', 'network']))
    setMapExpansionCard((prev) => prev || findHeader(['hba', 'expansion', 'raid', 'controller']))
    setMapGpu((prev) => prev || findHeader(['gpu', 'graphics']))
  }, [preview, selectedTemplateId])

  const saveTemplate = async () => {
    if (!tenantId) {
      alert('Tenant not ready yet. Try again in a moment.')
      return
    }

    const name = templateName.trim()
    if (!name) {
      alert('Please enter a template name.')
      return
    }

    if (!mapDescription && !mapModel && !mapSerialTag) {
      alert('Please map at least one of: Description, Model, or Serial/Service tag before saving.')
      return
    }

    try {
      const payload = {
        tenant_id: tenantId,
        name,
        mapping: {
          headerRow,

          description: mapDescription || undefined,
          qty: mapQty || undefined,
          price: mapPrice || undefined,

          serial_tag: mapSerialTag || undefined,
          model: mapModel || undefined,
          cpu: mapCpu || undefined,
          cpu_qty: mapCpuQty || undefined,
          memory_part_numbers: mapMemoryPNCols?.filter(Boolean)?.length ? mapMemoryPNCols.filter(Boolean) : undefined,
          memory_qty: mapMemoryQty || undefined,
          network_card: mapNetworkCard || undefined,
          expansion_card: mapExpansionCard || undefined,
          gpu: mapGpu || undefined,
        } satisfies MappingJson,
      }

      const { data, error } = await supabase
        .from('import_mappings')
        .upsert(payload, { onConflict: 'tenant_id,name' })
        .select('id,tenant_id,name,mapping,updated_at')
        .single()

      if (error) throw error

      await loadTemplates(tenantId)
      setSelectedTemplateId(data.id)
      alert(`Saved template: ${name}`)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to save template'
      alert(msg)
    }
  }

  const addMemoryPNMapping = () => setMapMemoryPNCols((prev) => [...prev, ''])
  const updateMemoryPNMappingAt = (idx: number, value: string) =>
    setMapMemoryPNCols((prev) => prev.map((v, i) => (i === idx ? value : v)))
  const removeMemoryPNMappingAt = (idx: number) =>
    setMapMemoryPNCols((prev) => prev.filter((_, i) => i !== idx))

  function getMappedColumnSet(): Set<string> {
    const set = new Set<string>()

    const add = (v: string) => {
      const s = String(v ?? '').trim()
      if (s) set.add(s)
    }

    add(mapDescription)
    add(mapQty)
    add(mapPrice)

    add(mapSerialTag)
    add(mapModel)
    add(mapCpu)
    add(mapCpuQty)
    add(mapMemoryQty)
    add(mapNetworkCard)
    add(mapExpansionCard)
    add(mapGpu)

    for (const c of mapMemoryPNCols ?? []) add(c)

    return set
  }

  const importFullSheetToLineItems = async () => {
    if (!selectedFile) {
      alert('Please choose a file first.')
      return
    }

    if (!mapDescription && !mapModel && !mapSerialTag) {
      alert('Map at least one of: Description, Model, Serial/Service tag.')
      return
    }

    setImporting(true)

    try {
      const fullMatrix = await parseSpreadsheetMatrix(selectedFile)
      const fullSheet = buildSheetFromMatrix(fullMatrix, Math.max(0, headerRow - 1))

      const MAX_ROWS = 5000
      const rows = fullSheet.rows.length > MAX_ROWS ? fullSheet.rows.slice(0, MAX_ROWS) : fullSheet.rows

      const memoryCols = (mapMemoryPNCols ?? []).filter((c) => String(c).trim() !== '')
      const mappedCols = getMappedColumnSet()

      const payload = rows
        .map((r) => {
          const desc = mapDescription ? String(r?.[mapDescription] ?? '').trim() : ''
          const model = mapModel ? String(r?.[mapModel] ?? '').trim() : ''
          const serial_tag = mapSerialTag ? String(r?.[mapSerialTag] ?? '').trim() : ''

          const description = (desc || model || serial_tag).trim()
          if (!description) return null

          const qty = mapQty ? toQtyOrDefault(r?.[mapQty], 1) : 1
          const asking_price = mapPrice ? parseMoneyOrNull(r?.[mapPrice]) : null

          const cpu = mapCpu ? String(r?.[mapCpu] ?? '').trim() : ''
          const cpu_qty = mapCpuQty ? parseIntOrNull(r?.[mapCpuQty]) : null

          const memory_qty = mapMemoryQty ? parseIntOrNull(r?.[mapMemoryQty]) : null

          const memoryPNs = memoryCols
            .map((c) => String(r?.[c] ?? '').trim())
            .filter((v) => v !== '')
          const memory_part_numbers = memoryPNs.length ? Array.from(new Set(memoryPNs)).join(', ') : null

          const network_card = mapNetworkCard ? String(r?.[mapNetworkCard] ?? '').trim() : ''
          const expansion_card = mapExpansionCard ? String(r?.[mapExpansionCard] ?? '').trim() : ''
          const gpu = mapGpu ? String(r?.[mapGpu] ?? '').trim() : ''

          // SPECS CAPTURE: store all unmapped columns with non-empty values
          const specs: Record<string, unknown> = {
            _meta: {
              source_file: selectedFileName || selectedFile.name,
              header_row: headerRow,
            },
          }

          for (const h of fullSheet.headers) {
            if (mappedCols.has(h)) continue
            const v = r?.[h]
            if (isNonEmpty(v)) specs[h] = v
          }

          return {
            lot_id: id,

            // core
            description,
            qty,
            asking_price,

            // buyer-facing columns
            serial_tag: serial_tag || null,
            model: model || null,
            cpu: cpu || null,
            cpu_qty,
            memory_part_numbers,
            memory_qty,
            network_card: network_card || null,
            expansion_card: expansion_card || null,
            gpu: gpu || null,

            // raw specs for everything else
            specs,
          }
        })
        .filter(Boolean) as Record<string, unknown>[]

      if (payload.length === 0) {
        alert('No valid rows found to import (check your header row + mapping).')
        return
      }

      const { data, error } = await supabase
        .from('line_items')
        .insert(payload)
        .select('id,lot_id,cpu,cpu_qty,memory_part_numbers,memory_qty,gpu,specs')

      if (error) throw error
      await logAvailableParts((data as Array<{
        id: string
        lot_id: string | null
        cpu: string | null
        cpu_qty: number | null
        memory_part_numbers: string | null
        memory_qty: number | null
        gpu: string | null
        specs: Record<string, unknown> | null
      }>) || [])

      const cappedMsg = fullSheet.rows.length > MAX_ROWS ? ` (capped at ${MAX_ROWS})` : ''
      alert(`Imported ${payload.length} line items${cappedMsg}.`)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Import failed'
      alert(msg)
    } finally {
      setImporting(false)
    }
  }

  const Select = ({
    label,
    value,
    onChange,
    optionalNote,
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    optionalNote?: string
  }) => {
    return (
      <div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>
          {label} {optionalNote ? <span style={{ color: '#666' }}>{optionalNote}</span> : null}
        </div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ padding: 8, border: '1px solid #ddd', minWidth: 220 }}
          disabled={headers.length === 0}
        >
          <option value="">{optionalNote ? optionalNote : '— select —'}</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Import spreadsheet</h1>
          <div style={{ color: '#666' }}>
            {lot?.title ?? 'Lot'} • {lot?.currency ?? 'USD'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Link href={`/dashboard/lots/${id}`}>← Back to lot</Link>
        </div>
      </div>

      <hr style={{ margin: '16px 0' }} />

      <h2>Mapping templates</h2>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Load template</div>
          <select
            value={selectedTemplateId}
            onChange={(e) => applyTemplate(e.target.value)}
            style={{ padding: 8, border: '1px solid #ddd', minWidth: 320 }}
          >
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Save current mapping as</div>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Dell EMC format"
            style={{ padding: 8, border: '1px solid #ddd', width: 260 }}
          />
        </div>

        <button onClick={saveTemplate} style={{ padding: 10, marginTop: 18 }}>
          Save template
        </button>
      </div>

      {selectedTemplate ? (
        <div style={{ marginTop: 8, color: '#666' }}>
          Loaded: <strong>{selectedTemplate.name}</strong> • Header row: <strong>{headerRow}</strong>
        </div>
      ) : null}

      <hr style={{ margin: '16px 0' }} />

      <h2>Upload spreadsheet (preview)</h2>

      <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        {selectedFileName ? <span>{selectedFileName}</span> : null}
        {uploading ? <span>Parsing…</span> : null}

        <div style={{ marginLeft: 'auto' }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>Header row</div>
          <input
            type="number"
            min={1}
            max={Math.max(1, previewMatrix.length)}
            value={headerRow}
            onChange={(e) => setHeaderRow(Number(e.target.value))}
            style={{ width: 120, padding: 8, border: '1px solid #ddd' }}
            disabled={previewMatrix.length === 0}
          />
        </div>
      </div>

      {parseError ? <div style={{ marginTop: 8, color: 'crimson' }}>{parseError}</div> : null}

      {preview ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Headers (from row {headerRow}):</strong> {headers.join(', ') || '(none)'}
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #ddd' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {headers.slice(0, 12).map((h) => (
                    <th
                      key={h}
                      style={{
                        borderBottom: '1px solid #ddd',
                        textAlign: 'left',
                        padding: 8,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 20).map((row, idx) => (
                  <tr key={idx}>
                    {headers.slice(0, 12).map((h) => (
                      <td
                        key={h}
                        style={{
                          borderBottom: '1px solid #f0f0f0',
                          padding: 8,
                          verticalAlign: 'top',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {String(row?.[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 8, color: '#666' }}>
            Import will include all unmapped columns into <code>line_items.specs</code>.
          </div>

          <hr style={{ margin: '16px 0' }} />

          <h2>Column mapping</h2>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <Select
              label="Description"
              value={mapDescription}
              onChange={setMapDescription}
              optionalNote="(optional if Model/Serial mapped)"
            />
            <Select label="Qty" value={mapQty} onChange={setMapQty} optionalNote="(default 1)" />
            <Select label="Asking Price" value={mapPrice} onChange={setMapPrice} optionalNote="(blank allowed)" />
          </div>

          <h3 style={{ marginTop: 16 }}>Buyer-facing fields</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <Select label="Serial / Service tag" value={mapSerialTag} onChange={setMapSerialTag} optionalNote="(optional)" />
            <Select label="Model" value={mapModel} onChange={setMapModel} optionalNote="(recommended)" />
            <Select label="CPU" value={mapCpu} onChange={setMapCpu} optionalNote="(optional)" />
            <Select label="CPU Quantity" value={mapCpuQty} onChange={setMapCpuQty} optionalNote="(optional)" />
            <Select label="Memory Quantity (DIMMs)" value={mapMemoryQty} onChange={setMapMemoryQty} optionalNote="(optional)" />
            <Select label="Network card" value={mapNetworkCard} onChange={setMapNetworkCard} optionalNote="(optional)" />
            <Select label="Expansion card" value={mapExpansionCard} onChange={setMapExpansionCard} optionalNote="(optional)" />
            <Select label="GPU" value={mapGpu} onChange={setMapGpu} optionalNote="(optional)" />
          </div>

          <h3 style={{ marginTop: 16 }}>Memory Part Number(s)</h3>
          <div style={{ marginTop: 8, color: '#666' }}>
            Add one or more columns that contain memory part numbers (we’ll combine them into a single field).
          </div>

          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mapMemoryPNCols.length === 0 ? <div style={{ color: '#666' }}>(none added)</div> : null}

            {mapMemoryPNCols.map((col, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={col}
                  onChange={(e) => updateMemoryPNMappingAt(idx, e.target.value)}
                  style={{ padding: 8, border: '1px solid #ddd', minWidth: 320 }}
                >
                  <option value="">— select column —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeMemoryPNMappingAt(idx)} style={{ padding: 10 }}>
                  Remove
                </button>
              </div>
            ))}

            <div>
              <button onClick={addMemoryPNMapping} style={{ padding: 10 }}>
                + Add memory PN column
              </button>
            </div>
          </div>

          <hr style={{ margin: '16px 0' }} />

          <button onClick={importFullSheetToLineItems} disabled={importing} style={{ padding: 10 }}>
            {importing ? 'Importing…' : 'Import line items'}
          </button>
        </div>
      ) : null}
    </main>
  )
}
