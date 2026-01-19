
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MachineType = 'server' | 'storage' | 'network'

type SystemModel = {
  id: string
  tenant_id: string | null
  machine_type: MachineType
  manufacturer: string
  family: string | null
  model: string
  form_factor: string | null
  tags: string[]
}

type ComponentModel = {
  id: string
  tenant_id: string | null
  component_type: string
  manufacturer: string | null
  model: string
  part_number: string | null
  category?: string | null
  oem?: string | null
  description?: string | null
  tags: string[]
}

type CompatibleResp = {
  ok: boolean
  items?: ComponentModel[]
  message?: string
}

type AdvancedField = {
  key: string
  label: string
  kind: 'text' | 'number' | 'select' | 'readonly'
  options?: string[]
  placeholder?: string
}

type Source = 'catalog' | 'manual' | 'auto'

type ComponentRow = {
  id: string
  componentType: string
  source: Source
  partNumber: string
  description: string
  qty: string
  notes: string
  locked: boolean
}

const machineOptions = [
  { value: 'server', label: 'Server' },
  { value: 'storage', label: 'Storage' },
  { value: 'network', label: 'Network' },
] as const

const componentTypeLabels: Record<string, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  drive: 'Drive',
  gpu: 'GPU',
  nic: 'NIC',
  controller: 'Controller',
  transceiver: 'Transceiver',
  module: 'Module',
  power: 'Power Supply',
  cable: 'Cable',
  rail: 'Rail Kit',
  bezel: 'Bezel',
  remote_access: 'Remote Access',
  other: 'Other',
}

const componentOrderByMachine: Record<MachineType, string[]> = {
  server: ['cpu', 'memory', 'drive', 'controller', 'nic', 'gpu', 'power', 'rail', 'bezel', 'remote_access', 'module', 'cable', 'other'],
  storage: ['drive', 'controller', 'nic', 'transceiver', 'power', 'module', 'cable', 'other'],
  network: ['nic', 'transceiver', 'module', 'power', 'remote_access', 'cable', 'other'],
}

const requiredTypesByMachine: Record<MachineType, string[]> = {
  server: ['cpu', 'memory', 'drive'],
  storage: ['drive', 'controller'],
  network: ['nic'],
}

const advancedFieldsByMachine: Record<MachineType, AdvancedField[]> = {
  server: [
    { key: 'server_bays_25', label: '2.5 inch bays', kind: 'number', placeholder: '0' },
    { key: 'server_bays_35', label: '3.5 inch bays', kind: 'number', placeholder: '0' },
    { key: 'server_pcie', label: 'PCIe slots (count/gen)', kind: 'text', placeholder: 'e.g. 6 x Gen4' },
    { key: 'server_raid', label: 'Default RAID level', kind: 'select', options: ['RAID 0', 'RAID 1', 'RAID 5', 'RAID 6', 'RAID 10'] },
    { key: 'server_remote', label: 'Remote access tier', kind: 'select', options: ['Basic', 'Enterprise'] },
    { key: 'server_auto', label: 'Form factor', kind: 'readonly' },
  ],
  storage: [
    { key: 'storage_array_type', label: 'Array type', kind: 'select', options: ['Block (SAN)', 'File (NAS)', 'Unified'] },
    { key: 'storage_cache', label: 'Cache size', kind: 'text', placeholder: 'e.g. 64GB' },
    { key: 'storage_shelves', label: 'Shelf count', kind: 'number', placeholder: '0' },
    { key: 'storage_protect', label: 'Protection scheme', kind: 'select', options: ['RAID', 'Erasure coding', 'Distributed parity'] },
    { key: 'storage_auto', label: 'Back-end type', kind: 'readonly' },
  ],
  network: [
    { key: 'net_role', label: 'Deployment role', kind: 'select', options: ['Access', 'Aggregation', 'Core', 'Edge', 'Data Center'] },
    { key: 'net_ports', label: 'Port profile', kind: 'select', options: ['1GbE', '10GbE', '25GbE', '40GbE', '100GbE'] },
    { key: 'net_ha', label: 'HA mode', kind: 'select', options: ['Standalone', 'Active/Active', 'Active/Passive', 'Stack'] },
    { key: 'net_license', label: 'License tier', kind: 'select', options: ['Base', 'Advanced', 'Security', 'Enterprise'] },
    { key: 'net_auto', label: 'Form factor', kind: 'readonly' },
  ],
}

const autoComponentsByMachine: Record<MachineType, string[]> = {
  server: ['power', 'rail', 'bezel'],
  storage: ['power', 'controller'],
  network: ['power', 'remote_access'],
}

const componentTemplates = ['cpu', 'memory', 'drive', 'nic', 'controller']

const sourceOptions: { value: Source; label: string }[] = [
  { value: 'catalog', label: 'Catalog' },
  { value: 'manual', label: 'Manual entry' },
  { value: 'auto', label: 'Auto calculated' },
]

const normalizePartNumber = (value: string) => value.trim().toUpperCase()

const formatPlatformLabel = (model: SystemModel) => {
  const family = model.family ? `${model.family} / ` : ''
  const form = model.form_factor ? ` (${model.form_factor})` : ''
  return `${model.manufacturer} / ${family}${model.model}${form}`
}

const generateRowId = (() => {
  let counter = 0
  return () => `row-${Date.now().toString(36)}-${counter++}`
})()

const createRow = (overrides: Partial<ComponentRow> = {}): ComponentRow => {
  const base: ComponentRow = {
    id: generateRowId(),
    componentType: overrides.componentType ?? 'cpu',
    source: overrides.source ?? 'catalog',
    partNumber: overrides.partNumber ?? '',
    description: overrides.description ?? '',
    qty: overrides.qty ?? '',
    notes: overrides.notes ?? '',
    locked: overrides.locked ?? false,
  }
  const next = { ...base, ...overrides }
  if (next.source === 'auto') {
    next.locked = true
    if (!overrides.qty) next.qty = ''
  }
  return next
}

export default function ConfigurationsPage() {
  const [machineType, setMachineType] = useState<MachineType>('server')
  const [configName, setConfigName] = useState('')
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [compatibleComponents, setCompatibleComponents] = useState<ComponentModel[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState('')
  const [rows, setRows] = useState<ComponentRow[]>([])
  const [stockByPart, setStockByPart] = useState<Record<string, number>>({})
  const [stockLoading, setStockLoading] = useState(false)
  const [advancedValues, setAdvancedValues] = useState<Record<string, string>>({})

  const selectedModel = useMemo(() => systemModels.find((model) => model.id === selectedModelId) ?? null, [systemModels, selectedModelId])

  const componentOptions = useMemo(() => {
    const order = componentOrderByMachine[machineType] ?? []
    const seen = new Set<string>()
    const ordered: { value: string; label: string }[] = []
    order.forEach((type) => {
      if (!seen.has(type)) {
        ordered.push({ value: type, label: componentTypeLabels[type] ?? type })
        seen.add(type)
      }
    })
    Object.entries(componentTypeLabels).forEach(([type, label]) => {
      if (!seen.has(type)) {
        ordered.push({ value: type, label })
      }
    })
    return ordered
  }, [machineType])

  const catalogGroups = useMemo(() => {
    const groups: Record<string, ComponentModel[]> = {}
    compatibleComponents.forEach((component) => {
      const type = component.component_type || 'other'
      if (!groups[type]) groups[type] = []
      groups[type].push(component)
    })
    Object.values(groups).forEach((list) => list.sort((a, b) => a.model.localeCompare(b.model)))
    return groups
  }, [compatibleComponents])

  const requiredTypes = requiredTypesByMachine[machineType]

  const missingRequired = useMemo(() => {
    return requiredTypes.filter((type) => {
      return !rows.some((row) => row.componentType === type && row.partNumber.trim())
    })
  }, [requiredTypes, rows])

  const manualUsed = rows.some((row) => row.source === 'manual' && row.partNumber.trim())
  const compatibilityTone: 'good' | 'warn' | 'bad' = missingRequired.length ? 'bad' : manualUsed ? 'warn' : 'good'
  const compatibilityLabel = missingRequired.length
    ? 'Missing required components'
    : manualUsed
      ? 'Limited compatibility data (manual parts present)'
      : 'All required components present'

  const canSaveFinal = missingRequired.length === 0

  const compatibilityMessage = missingRequired.length ? `Missing: ${missingRequired.map((type) => componentTypeLabels[type] ?? type).join(', ')}` : ''

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    setCatalogError('')
    setSystemModels([])
    setSelectedModelId('')

    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const params = new URLSearchParams({ machine_type: machineType })
        const res = await fetch(`/api/catalog/system-models?${params.toString()}`, { headers })
        const json = await res.json()
        if (!json?.ok) throw new Error(json?.message || 'Failed to load models')
        const items = Array.isArray(json.items) ? json.items : []
        const mapped: SystemModel[] = items
          .map((row) => {
            const machineTypeRaw = typeof row.machine_type === 'string' ? row.machine_type : ''
            if (machineTypeRaw !== 'server' && machineTypeRaw !== 'storage' && machineTypeRaw !== 'network') return null
            return {
              id: String(row.id ?? ''),
              tenant_id: row.tenant_id ? String(row.tenant_id) : null,
              machine_type: machineTypeRaw as MachineType,
              manufacturer: String(row.manufacturer ?? ''),
              family: typeof row.family === 'string' && row.family.trim() ? row.family : null,
              model: String(row.model ?? ''),
              form_factor: typeof row.form_factor === 'string' && row.form_factor.trim() ? row.form_factor : null,
              tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
            }
          })
          .filter((item): item is SystemModel => Boolean(item))
        if (!cancelled) setSystemModels(mapped)
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : 'Failed to load models'
          setCatalogError(msg)
        }
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [machineType])

  useEffect(() => {
    const defaults = requiredTypes.map((type) =>
      createRow({ componentType: type, source: 'catalog', qty: '1', description: '', notes: '' })
    )
    setRows(defaults)
    setAdvancedValues({})
  }, [machineType, requiredTypes])

  useEffect(() => {
    if (!selectedModelId) return
    const autoList = autoComponentsByMachine[machineType] ?? []
    if (!autoList.length) return

    setRows((prev) => {
      const exists = new Set(prev.filter((row) => row.source === 'auto').map((row) => row.componentType))
      const additions = autoList
        .filter((type) => !exists.has(type))
        .map((type) =>
          createRow({
            componentType: type,
            source: 'auto',
            description: 'Auto configured',
            notes: 'Derived from platform',
          })
        )
      return additions.length ? [...prev, ...additions] : prev
    })
  }, [machineType, selectedModelId])

  useEffect(() => {
    if (!selectedModelId) {
      setCompatibleComponents([])
      return
    }
    let cancelled = false
    setCompatLoading(true)
    setCompatError('')

    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const params = new URLSearchParams({ system_model_id: selectedModelId })
        const res = await fetch(`/api/catalog/compatible-components?${params.toString()}`, { headers })
        const json = (await res.json()) as CompatibleResp
        if (!json.ok) throw new Error(json.message || 'Failed to load components')
        const mapped = (json.items ?? [])
          .map((row: unknown) => {
            const rec = row as Record<string, unknown>
            const rawType = (typeof rec.component_type === 'string' && rec.component_type) ||
              (typeof rec.category === 'string' ? rec.category : '')
            let normalizedType = rawType.toLowerCase()
            if (!(normalizedType in componentTypeLabels)) {
              if (normalizedType.includes('cpu')) normalizedType = 'cpu'
              else if (normalizedType.includes('mem') || normalizedType.includes('dimm') || normalizedType.includes('ram')) normalizedType = 'memory'
              else if (normalizedType.includes('drive') || normalizedType.includes('disk') || normalizedType.includes('ssd') || normalizedType.includes('hdd')) normalizedType = 'drive'
              else if (normalizedType.includes('nic') || normalizedType.includes('network') || normalizedType.includes('ethernet')) normalizedType = 'nic'
              else if (normalizedType.includes('controller') || normalizedType.includes('raid')) normalizedType = 'controller'
              else if (normalizedType.includes('gpu') || normalizedType.includes('graphics')) normalizedType = 'gpu'
              else if (normalizedType.includes('transceiver')) normalizedType = 'transceiver'
              else if (normalizedType.includes('rail')) normalizedType = 'rail'
              else if (normalizedType.includes('bezel')) normalizedType = 'bezel'
              else if (normalizedType.includes('power')) normalizedType = 'power'
              else if (normalizedType.includes('remote')) normalizedType = 'remote_access'
              else normalizedType = 'other'
            }
            const tags = Array.isArray(rec.tags) ? rec.tags.map((tag) => String(tag)) : []
            return {
              id: String(rec.id ?? ''),
              tenant_id: rec.tenant_id ? String(rec.tenant_id) : null,
              component_type: normalizedType,
              manufacturer: typeof rec.manufacturer === 'string' ? rec.manufacturer : null,
              model: String(rec.model ?? rec.description ?? ''),
              part_number: typeof rec.part_number === 'string' ? rec.part_number : null,
              category: typeof rec.category === 'string' ? rec.category : null,
              oem: typeof rec.oem === 'string' ? rec.oem : null,
              description: typeof rec.description === 'string' ? rec.description : null,
              tags,
            }
          })
          .filter((item): item is ComponentModel => Boolean(item))
        if (!cancelled) setCompatibleComponents(mapped)
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : 'Failed to load components'
          setCompatError(msg)
        }
      } finally {
        if (!cancelled) setCompatLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [selectedModelId])

  useEffect(() => {
    const partNumbers = Array.from(
      new Set(
        rows
          .map((row) => row.partNumber)
          .filter((value): value is string => Boolean(value.trim()))
          .map((pn) => normalizePartNumber(pn))
      )
    )
    if (!partNumbers.length) {
      setStockByPart({})
      return
    }
    let cancelled = false
    setStockLoading(true)

    const load = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const chunkSize = 200
        const next: Record<string, number> = {}
        for (let i = 0; i < partNumbers.length; i += chunkSize) {
          const chunk = partNumbers.slice(i, i + chunkSize)
          const params = new URLSearchParams()
          params.set('part_numbers', chunk.join(','))
          const res = await fetch(`/api/inventory/stock?${params.toString()}`, { headers })
          const json = (await res.json()) as { ok: boolean; items?: Array<{ part_number: string; qty: number }> }
          if (!json.ok) throw new Error('Failed to load stock')
          ;(json.items ?? []).forEach((item) => {
            if (!item.part_number) return
            const key = normalizePartNumber(item.part_number)
            next[key] = Number.isFinite(item.qty) ? Number(item.qty) : 0
          })
        }
        if (!cancelled) setStockByPart(next)
      } catch (error) {
        console.error('stock load failed', error)
      } finally {
        if (!cancelled) setStockLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [rows])

  const updateRow = (id: string, updater: Partial<ComponentRow> | ((row: ComponentRow) => ComponentRow)) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const next = typeof updater === 'function' ? updater(row) : { ...row, ...updater }
        if (next.source === 'auto') {
          next.locked = true
        } else {
          next.locked = false
        }
        return next
      })
    )
  }

  const handleComponentChange = (id: string, componentType: string) => {
    updateRow(id, (row) => ({
      ...row,
      componentType,
      partNumber: '',
      description: '',
      qty: requiredTypes.includes(componentType) ? row.qty || '1' : row.qty,
    }))
  }

  const handleSourceChange = (id: string, source: Source) => {
    updateRow(id, (row) => {
      if (source === 'auto') {
        return {
          ...row,
          source,
          partNumber: '',
          description: 'Auto configured',
          qty: '',
          notes: 'Derived from platform',
          locked: true,
        }
      }
      return {
        ...row,
        source,
        locked: false,
        partNumber: '',
        description: '',
      }
    })
  }

  const handlePartNumberChange = (id: string, value: string) => {
    updateRow(id, (row) => {
      const next: ComponentRow = { ...row, partNumber: value }
      if (row.source === 'catalog') {
        const normalized = normalizePartNumber(value)
        const candidates = catalogGroups[row.componentType] ?? []
        const match = candidates.find(
          (component) => component.part_number && normalizePartNumber(component.part_number) === normalized
        )
        if (match) {
          next.description = match.description ?? match.model
        }
      }
      return next
    })
  }

  const handleQtyChange = (id: string, value: string) => {
    updateRow(id, (row) => ({ ...row, qty: value }))
  }

  const handleDescriptionChange = (id: string, value: string) => {
    updateRow(id, (row) => ({ ...row, description: value }))
  }

  const handleNotesChange = (id: string, value: string) => {
    updateRow(id, (row) => ({ ...row, notes: value }))
  }

  const addRow = (componentType: string) => {
    setRows((prev) => [...prev, createRow({ componentType, source: 'catalog', qty: '1' })])
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id))
  }

  const catalogOptionsForRow = (row: ComponentRow) => catalogGroups[row.componentType] ?? []

  const stockStatus = (partNumber: string, qty: string) => {
    if (!partNumber) return { label: 'Stock unknown', tone: 'muted' }
    const key = normalizePartNumber(partNumber)
    if (!(key in stockByPart)) {
      return stockLoading ? { label: 'Checking stock…', tone: 'muted' } : { label: 'Stock unknown', tone: 'muted' }
    }
    const available = stockByPart[key]
    const requested = Number(qty) || 0
    if (available <= 0) return { label: 'Out of stock', tone: 'bad' }
    if (requested && requested > available) return { label: `Only ${available} available`, tone: 'warn' }
    return { label: `In stock (${available})`, tone: 'good' }
  }

  const handleSave = (kind: 'draft' | 'final') => {
    if (kind === 'final' && !canSaveFinal) return
    console.log('Save', kind, { configName, machineType, selectedModelId, rows, advancedValues })
  }

  const compatibilityBadgeText = compatibilityTone === 'good' ? '🟢' : compatibilityTone === 'warn' ? '🟡' : '🔴'
  return (
    <main className="configPage">
      <header className="headerRow">
        <div className="field">
          <label className="fieldLabel" htmlFor="machineType">
            Machine type
          </label>
          <select
            id="machineType"
            value={machineType}
            onChange={(event) => setMachineType(event.target.value as MachineType)}
          >
            {machineOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="fieldLabel" htmlFor="platformModel">
            Platform model
          </label>
          <select
            id="platformModel"
            value={selectedModelId}
            onChange={(event) => setSelectedModelId(event.target.value)}
          >
            <option value="">Select platform</option>
            {systemModels.map((model) => (
              <option key={model.id} value={model.id}>
                {formatPlatformLabel(model)}
              </option>
            ))}
          </select>
          {selectedModel ? (
            <span className="fieldNote">Selected platform: {formatPlatformLabel(selectedModel)}</span>
          ) : null}
          {catalogLoading ? <span className="fieldNote">Loading models…</span> : null}
          {catalogError ? <span className="fieldNote statusbad">{catalogError}</span> : null}
        </div>
        <div className="field">
          <label className="fieldLabel" htmlFor="configName">
            Configuration name
          </label>
          <input
            id="configName"
            type="text"
            value={configName}
            onChange={(event) => setConfigName(event.target.value)}
            placeholder="Enter a name"
          />
        </div>
      </header>

      <div className="tableWrapper">
        <table className="gridTable">
          <thead>
            <tr>
              <th>Component</th>
              <th>Source</th>
              <th>Part Number</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Stock</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isRequired = requiredTypes.includes(row.componentType)
              const filled = Boolean(row.partNumber.trim())
              const indicatorTone = isRequired ? (filled ? 'good' : 'bad') : 'muted'
              const indicatorEmoji = isRequired ? (filled ? '🟢' : '🔴') : '⚪'
              const stock = row.source === 'auto' ? { label: 'Auto', tone: 'muted' } : stockStatus(row.partNumber, row.qty)
              const partOptions = catalogOptionsForRow(row)
              return (
                <tr key={row.id} className={row.locked ? 'lockedRow' : ''}>
                  <td>
                    <div className="componentCell">
                      <span className={`rowIndicator ${indicatorTone}`}>{indicatorEmoji}</span>
                      <select
                        value={row.componentType}
                        onChange={(event) => handleComponentChange(row.id, event.target.value)}
                        disabled={row.locked}
                      >
                        {componentOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>
                    <select value={row.source} onChange={(event) => handleSourceChange(row.id, event.target.value as Source)} disabled={row.locked}>
                      {sourceOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {row.source === 'auto' ? (
                      <span className="autoText">Auto</span>
                    ) : row.source === 'catalog' ? (
                      <div className="inputWithDatalist">
                        <input
                          type="text"
                          list={`catalog-${row.id}`}
                          value={row.partNumber}
                          onChange={(event) => handlePartNumberChange(row.id, event.target.value)}
                          placeholder="Search part"
                        />
                        <datalist id={`catalog-${row.id}`}>
                          {partOptions
                            .filter((option) => option.part_number)
                            .map((option) => (
                              <option key={`${option.id}-${option.part_number}`} value={option.part_number!}>
                                {option.model}{option.part_number ? ` (${option.part_number})` : ''}
                              </option>
                            ))}
                        </datalist>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={row.partNumber}
                        onChange={(event) => handlePartNumberChange(row.id, event.target.value)}
                        placeholder="Manually enter part"
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(event) => handleDescriptionChange(row.id, event.target.value)}
                      placeholder="Describe the component"
                      disabled={row.source === 'auto'}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      value={row.qty}
                      onChange={(event) => handleQtyChange(row.id, event.target.value)}
                      disabled={row.source === 'auto'}
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <span className={`statusPill status${stock.tone}`}>{stock.label}</span>
                  </td>
                  <td>
                    <div className="notesCell">
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(event) => handleNotesChange(row.id, event.target.value)}
                        placeholder="Add notes"
                        disabled={row.locked}
                      />
                      <button
                        type="button"
                        className="tinyTextBtn"
                        onClick={() => removeRow(row.id)}
                        disabled={row.locked}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="templateRow">
        {componentTemplates.map((type) => (
          <button type="button" key={type} className="flatBtn" onClick={() => addRow(type)}>
            + Add {componentTypeLabels[type] ?? type}
          </button>
        ))}
      </div>

      <div className={`compatSummary compat${compatibilityTone}`}>
        <strong>Compatibility status:</strong> {compatibilityBadgeText} {compatibilityLabel}
      </div>
      {compatLoading ? <div className="compatNote warn">Loading compatible components…</div> : null}
      {compatibilityMessage ? <div className="compatNote">{compatibilityMessage}</div> : null}
      {manualUsed ? <div className="compatNote warn">Manual parts may need verification.</div> : null}
      {compatError ? <div className="compatNote statusbad">{compatError}</div> : null}

      <details className="advancedSection">
        <summary>▸ Advanced Properties (optional)</summary>
        <div className="advancedGrid">
          {(advancedFieldsByMachine[machineType] ?? []).map((field) => {
            const value = advancedValues[field.key] ?? ''
            const readOnly = field.kind === 'readonly'
            return (
              <label key={field.key} className="advancedField">
                <span className="fieldLabel">{field.label}</span>
                {field.kind === 'select' ? (
                  <select
                    value={value}
                    onChange={(event) => setAdvancedValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    disabled={readOnly}
                  >
                    <option value="">Select</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.kind === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={(event) => setAdvancedValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                    placeholder={field.placeholder}
                    readOnly={readOnly}
                  />
                )}
              </label>
            )
          })}
        </div>
      </details>

      <div className="actionsRow">
        <button className="primaryBtn" type="button" onClick={() => handleSave('draft')}>
          Save draft
        </button>
        <button className="primaryBtn" type="button" onClick={() => handleSave('final')} disabled={!canSaveFinal}>
          Save final
        </button>
      </div>

      <style jsx>{`
        .configPage {
          padding: 24px;
          display: grid;
          gap: 16px;
        }
        .headerRow {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .field {
          display: grid;
          gap: 6px;
        }
        .fieldLabel {
          font-size: 12px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        select,
        input[type='text'],
        input[type='number'] {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          color: var(--text);
          font: inherit;
        }
        .tableWrapper {
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: auto;
          background: var(--panel);
        }
        .gridTable {
          width: 100%;
          border-collapse: collapse;
          min-width: 720px;
        }
        .gridTable th,
        .gridTable td {
          padding: 10px;
          border-bottom: 1px solid var(--border);
        }
        .gridTable th {
          text-align: left;
          font-size: 12px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .gridTable tbody tr:last-child td {
          border-bottom: none;
        }
        .componentCell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .componentCell select {
          flex: 1;
        }
        .rowIndicator {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          border: 1px solid transparent;
        }
        .rowIndicator.good {
          border-color: #7ce7a0;
          background: rgba(124, 231, 160, 0.1);
        }
        .rowIndicator.bad {
          border-color: #f78383;
          background: rgba(247, 131, 131, 0.1);
        }
        .rowIndicator.muted {
          border-color: var(--border);
          background: transparent;
        }
        .statusPill {
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid var(--border);
        }
        .statusgood {
          color: #7ce7a0;
          background: rgba(124, 231, 160, 0.1);
          border-color: rgba(124, 231, 160, 0.4);
        }
        .statuswarn {
          color: #f7c76a;
          background: rgba(247, 199, 106, 0.15);
          border-color: rgba(247, 199, 106, 0.6);
        }
        .statusbad {
          color: #f78383;
          background: rgba(247, 131, 131, 0.16);
          border-color: rgba(247, 131, 131, 0.6);
        }
        .statusmuted {
          color: var(--muted);
          background: rgba(255, 255, 255, 0.04);
        }
        .lockedRow {
          opacity: 0.85;
        }
        .notesCell {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .notesCell input {
          flex: 1;
        }
        .tinyTextBtn {
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 8px;
        }
        .tinyTextBtn:disabled {
          cursor: not-allowed;
          opacity: 0.4;
        }
        .autoText {
          font-size: 12px;
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .inputWithDatalist input {
          padding-right: 16px;
        }
        .templateRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .flatBtn {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 6px 12px;
          background: var(--panel-2);
          color: var(--text);
          cursor: pointer;
          font-weight: 600;
        }
        .compatSummary {
          border-radius: 10px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          font-weight: 700;
        }
        .compatgood {
          background: rgba(124, 231, 160, 0.08);
          color: #7ce7a0;
        }
        .compatwarn {
          background: rgba(247, 199, 106, 0.12);
          color: #f7c76a;
        }
        .compatbad {
          background: rgba(247, 131, 131, 0.12);
          color: #f78383;
        }
        .compatNote {
          font-size: 12px;
          color: var(--muted);
        }
        .compatNote.warn {
          color: #f7c76a;
        }
        .advancedSection {
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--panel);
          padding: 8px 12px;
        }
        .advancedSection summary {
          font-weight: 700;
          cursor: pointer;
          margin: 0;
        }
        .advancedGrid {
          margin-top: 12px;
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .advancedField {
          display: grid;
          gap: 6px;
        }
        .actionsRow {
          display: flex;
          gap: 12px;
        }
        .primaryBtn {
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }
        .primaryBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 900px) {
          .gridTable {
            min-width: 0;
          }
          .actionsRow {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  )
}
