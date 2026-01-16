'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MachineType = 'server' | 'storage' | 'network'

type Step = 1 | 2 | 3 | 4

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
  tags: string[]
}

type SystemModelsResp = {
  ok: boolean
  items?: SystemModel[]
  message?: string
}

type CompatibleResp = {
  ok: boolean
  items?: ComponentModel[]
  message?: string
}

type ComponentSelection = {
  componentId: string
  qty: string
}

type ManualEntry = {
  enabled: boolean
  label: string
  partNumber: string
  qty: string
  notes: string
}

type AdvancedField = {
  key: string
  label: string
  kind: 'text' | 'number' | 'select' | 'readonly'
  options?: string[]
  placeholder?: string
}

const machineOptions = [
  { value: 'server', label: 'Server' },
  { value: 'storage', label: 'Storage' },
  { value: 'network', label: 'Network device' },
] as const

const componentTypeLabels: Record<string, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  drive: 'Drives',
  gpu: 'GPU',
  nic: 'Network card',
  controller: 'Controller',
  transceiver: 'Transceiver',
  module: 'Module',
  power: 'Power',
  cable: 'Cable',
  other: 'Other',
}

const componentOrderByMachine: Record<MachineType, string[]> = {
  server: ['cpu', 'memory', 'drive', 'controller', 'nic', 'power', 'gpu', 'transceiver', 'module', 'cable', 'other'],
  storage: ['drive', 'controller', 'nic', 'transceiver', 'module', 'power', 'cable', 'other'],
  network: ['nic', 'transceiver', 'module', 'power', 'cable', 'other'],
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

const autoPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--muted)',
  fontSize: 11,
}

const controlStyle = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--panel-2)',
  color: 'var(--text)',
}

const normalizePartNumber = (value: string) => value.trim().toUpperCase()

export default function ConfigurationsPage() {
  const [step, setStep] = useState<Step>(1)
  const [machineType, setMachineType] = useState<MachineType>('server')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])

  const [platformSearch, setPlatformSearch] = useState('')
  const [filterManufacturer, setFilterManufacturer] = useState('')
  const [filterFormFactor, setFilterFormFactor] = useState('')
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')

  const [compatibleComponents, setCompatibleComponents] = useState<ComponentModel[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState('')

  const [selectedComponents, setSelectedComponents] = useState<Record<string, ComponentSelection>>({})
  const [manualOverrides, setManualOverrides] = useState<Record<string, ManualEntry>>({})
  const [componentSearch, setComponentSearch] = useState<Record<string, string>>({})
  const [advancedValues, setAdvancedValues] = useState<Record<string, string>>({})
  const [stockByPart, setStockByPart] = useState<Record<string, number>>({})
  const [stockLoading, setStockLoading] = useState(false)
  const [stockChecked, setStockChecked] = useState<Record<string, boolean>>({})

  const filteredModels = useMemo(() => systemModels.filter((m) => m.machine_type === machineType), [systemModels, machineType])

  const manufacturerOptions = useMemo(() => {
    const set = new Set(filteredModels.map((m) => m.manufacturer).filter(Boolean))
    return Array.from(set).sort()
  }, [filteredModels])

  const formFactorOptions = useMemo(() => {
    const set = new Set(filteredModels.map((m) => m.form_factor).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [filteredModels])

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()
    filteredModels.forEach((model) => {
      model.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1))
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag)
  }, [filteredModels])

  const formatPlatformLabel = (model: SystemModel) => {
    const family = model.family ? `${model.family} / ` : ''
    const form = model.form_factor ? ` (${model.form_factor})` : ''
    return `${model.manufacturer} / ${family}${model.model}${form}`
  }

  const getStockQty = (partNumber?: string | null) => {
    if (!partNumber) return null
    const key = normalizePartNumber(partNumber)
    return Object.prototype.hasOwnProperty.call(stockByPart, key) ? stockByPart[key] : null
  }

  const renderStockPill = (partNumber: string | null | undefined, qtyValue: string) => {
    if (!partNumber) {
      return <span style={autoPillStyle}>Stock unknown</span>
    }
    const key = normalizePartNumber(partNumber)
    const checked = Object.prototype.hasOwnProperty.call(stockChecked, key)
    const stockQty = getStockQty(partNumber)
    if (!checked) {
      return <span style={autoPillStyle}>Stock unknown</span>
    }
    if (stockQty == null) {
      return stockLoading ? <span style={autoPillStyle}>Stock loading</span> : <span className="statusPill statusbad">No stock</span>
    }
    const requested = Number(qtyValue || 0)
    if (Number.isFinite(requested) && stockQty > 0 && requested > stockQty) {
      return <span className="statusPill statuswarn">Only {stockQty} in stock</span>
    }
    if (stockQty <= 0) {
      return <span className="statusPill statusbad">No stock</span>
    }
    return <span className="statusPill statusgood">In stock (qty: {stockQty})</span>
  }

  const formatOptionLabel = (component: ComponentModel) => {
    const base = `${component.manufacturer ? `${component.manufacturer} ` : ''}${component.model}${
      component.part_number ? ` (${component.part_number})` : ''
    }`
    if (!component.part_number) return `${base} — Stock: n/a`
    const key = normalizePartNumber(component.part_number)
    const checked = Object.prototype.hasOwnProperty.call(stockChecked, key)
    const stockQty = getStockQty(component.part_number)
    if (!checked) return `${base} — Stock: n/a`
    if (stockQty == null) return `${base} — Stock: ${stockLoading ? '...' : 'No stock'}`
    return `${base} — ${stockQty > 0 ? 'In stock' : 'No stock'}`
  }

  const platformResults = useMemo(() => {
    const query = platformSearch.trim().toLowerCase()
    return filteredModels
      .filter((model) => {
        if (filterManufacturer && model.manufacturer !== filterManufacturer) return false
        if (filterFormFactor && model.form_factor !== filterFormFactor) return false
        if (filterTags.length && !filterTags.every((tag) => model.tags.includes(tag))) return false
        if (!query) return true
        const haystack = [model.manufacturer, model.family || '', model.model, model.form_factor || '', model.tags.join(' ')].join(' ').toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => {
        const maker = a.manufacturer.localeCompare(b.manufacturer)
        if (maker !== 0) return maker
        const family = (a.family || '').localeCompare(b.family || '')
        if (family !== 0) return family
        return a.model.localeCompare(b.model)
      })
  }, [filteredModels, filterManufacturer, filterFormFactor, filterTags, platformSearch])

  const selectedModel = useMemo(() => filteredModels.find((m) => m.id === selectedModelId) || null, [filteredModels, selectedModelId])

  useEffect(() => {
    const loadCatalog = async () => {
      setCatalogLoading(true)
      setCatalogError('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const params = new URLSearchParams({ machine_type: machineType })
        const res = await fetch(`/api/catalog/system-models?${params.toString()}`, { headers })
        const json = (await res.json()) as SystemModelsResp
        if (!json.ok) throw new Error(json.message || 'Failed to load catalog')
        const mapped = (json.items ?? [])
          .map((rec) => {
            const row = rec as Record<string, unknown>
            const machineTypeRaw = typeof row.machine_type === 'string' ? row.machine_type : ''
            if (machineTypeRaw !== 'server' && machineTypeRaw !== 'storage' && machineTypeRaw !== 'network') return null
            const tags = Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : []
            return {
              id: String(row.id ?? ''),
              tenant_id: row.tenant_id ? String(row.tenant_id) : null,
              machine_type: machineTypeRaw as MachineType,
              manufacturer: String(row.manufacturer ?? ''),
              family: typeof row.family === 'string' && row.family.trim() ? row.family : null,
              model: String(row.model ?? ''),
              form_factor: typeof row.form_factor === 'string' && row.form_factor.trim() ? row.form_factor : null,
              tags,
            } satisfies SystemModel
          })
          .filter((item): item is SystemModel => Boolean(item))
        setSystemModels(mapped)
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load catalog'
        setCatalogError(msg)
      } finally {
        setCatalogLoading(false)
      }
    }
    loadCatalog()
  }, [machineType])

  useEffect(() => {
    setSelectedModelId('')
    setPlatformSearch('')
    setFilterManufacturer('')
    setFilterFormFactor('')
    setFilterTags([])
    setSelectedComponents({})
    setManualOverrides({})
    setComponentSearch({})
    setAdvancedValues({})
    setCompatError('')
    setCompatibleComponents([])
    setStockByPart({})
    setStockLoading(false)
    setStockChecked({})
    setStep(1)
  }, [machineType])

  useEffect(() => {
    setSelectedComponents({})
    setManualOverrides({})
    setComponentSearch({})
    setAdvancedValues({})
    setCompatError('')
    setStockByPart({})
    setStockLoading(false)
    setStockChecked({})
  }, [selectedModelId])

  useEffect(() => {
    const loadCompat = async () => {
      if (!selectedModelId) {
        setCompatibleComponents([])
        return
      }
      setCompatLoading(true)
      setCompatError('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const params = new URLSearchParams({ system_model_id: selectedModelId })
        const res = await fetch(`/api/catalog/compatible-components?${params.toString()}`, { headers })
        const json = (await res.json()) as CompatibleResp
        if (!json.ok) throw new Error(json.message || 'Failed to load compatible parts')
        const mapped = (json.items ?? []).map((rec: unknown) => {
          const row = rec as Record<string, unknown>
          const rawType = typeof row.component_type === 'string' ? row.component_type : 'other'
          const tags = Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : []
          return {
            id: String(row.id ?? ''),
            tenant_id: row.tenant_id ? String(row.tenant_id) : null,
            component_type: rawType,
            manufacturer: typeof row.manufacturer === 'string' ? row.manufacturer : null,
            model: String(row.model ?? ''),
            part_number: typeof row.part_number === 'string' ? row.part_number : null,
            tags,
          } satisfies ComponentModel
        })
        setCompatibleComponents(mapped)
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load compatible parts'
        setCompatError(msg)
      } finally {
        setCompatLoading(false)
      }
    }
    loadCompat()
  }, [selectedModelId])

  useEffect(() => {
    const loadStock = async (partNumbers: string[], replace: boolean) => {
      if (partNumbers.length === 0) {
        if (replace) setStockByPart({})
        setStockLoading(false)
        if (replace) setStockChecked({})
        return
      }
      setStockLoading(true)
      const checkedUpdate = Object.fromEntries(partNumbers.map((pn) => [pn, true]))
      setStockChecked((prev) => (replace ? checkedUpdate : { ...prev, ...checkedUpdate }))
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
          if (!json.ok) {
            throw new Error('Failed to load stock')
          }
          ;(json.items ?? []).forEach((item) => {
            if (!item.part_number) return
            const key = normalizePartNumber(item.part_number)
            const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0
            next[key] = qty
          })
        }

        setStockByPart((prev) => (replace ? next : { ...prev, ...next }))
      } catch (e) {
        console.error('stock load error', e)
      } finally {
        setStockLoading(false)
      }
    }

    const partNumbers = Array.from(
      new Set(
        compatibleComponents
          .map((component) => component.part_number)
          .filter((value): value is string => Boolean(value && value.trim()))
          .map((value) => normalizePartNumber(value))
      )
    )

    loadStock(partNumbers, true)
  }, [compatibleComponents])

  useEffect(() => {
    const manualPartNumbers = Object.values(manualOverrides)
      .filter((entry) => entry.enabled && entry.partNumber.trim())
      .map((entry) => normalizePartNumber(entry.partNumber))
    const missing = manualPartNumbers.filter((pn) => !(pn in stockChecked))
    if (!missing.length) return

    const handle = setTimeout(() => {
      void (async () => {
        const checkedUpdate = Object.fromEntries(Array.from(new Set(missing)).map((pn) => [pn, true]))
        setStockChecked((prev) => ({ ...prev, ...checkedUpdate }))
        setStockLoading(true)
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const chunkSize = 200
        const next: Record<string, number> = {}

        for (let i = 0; i < missing.length; i += chunkSize) {
          const chunk = missing.slice(i, i + chunkSize)
          const params = new URLSearchParams()
          params.set('part_numbers', chunk.join(','))
          const res = await fetch(`/api/inventory/stock?${params.toString()}`, { headers })
          const json = (await res.json()) as { ok: boolean; items?: Array<{ part_number: string; qty: number }> }
          if (!json.ok) {
            throw new Error('Failed to load stock')
          }
          ;(json.items ?? []).forEach((item) => {
            if (!item.part_number) return
            const key = normalizePartNumber(item.part_number)
            const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0
            next[key] = qty
          })
        }

        setStockByPart((prev) => ({ ...prev, ...next }))
      })()
        .catch((e) => console.error('manual stock load error', e))
        .finally(() => setStockLoading(false))
    }, 300)

    return () => clearTimeout(handle)
  }, [manualOverrides, stockChecked])

  const compatibleByType = useMemo(() => {
    const groups: Record<string, ComponentModel[]> = {}
    compatibleComponents.forEach((component) => {
      const key = component.component_type || 'other'
      if (!groups[key]) groups[key] = []
      groups[key].push(component)
    })
    Object.values(groups).forEach((list) => list.sort((a, b) => a.model.localeCompare(b.model)))
    return groups
  }, [compatibleComponents])

  const componentOrder = componentOrderByMachine[machineType]
  const requiredTypes = requiredTypesByMachine[machineType]
  const recommendedTypes = componentOrder.filter(
    (type) => !requiredTypes.includes(type) && (compatibleByType[type] || []).length > 0
  )
  const optionalTypes = componentOrder.filter((type) => !requiredTypes.includes(type) && !recommendedTypes.includes(type))

  const componentLookup = useMemo(() => {
    const map = new Map<string, ComponentModel>()
    compatibleComponents.forEach((component) => map.set(component.id, component))
    return map
  }, [compatibleComponents])

  const updateComponentSelection = (type: string, componentId: string) => {
    setSelectedComponents((prev) => {
      if (!componentId) {
        const next = { ...prev }
        delete next[type]
        return next
      }
      const existing = prev[type]
      return {
        ...prev,
        [type]: { componentId, qty: existing?.qty || '1' },
      }
    })
  }

  const updateComponentQty = (type: string, qty: string) => {
    setSelectedComponents((prev) => {
      const existing = prev[type]
      if (!existing) return prev
      return { ...prev, [type]: { ...existing, qty } }
    })
  }

  const updateManualOverride = (type: string, updates: Partial<ManualEntry>) => {
    setManualOverrides((prev) => {
      const current = prev[type] || { enabled: false, label: '', partNumber: '', qty: '1', notes: '' }
      return { ...prev, [type]: { ...current, ...updates } }
    })
  }

  const enableManual = (type: string) => {
    setSelectedComponents((prev) => {
      if (!prev[type]) return prev
      const next = { ...prev }
      delete next[type]
      return next
    })
    updateManualOverride(type, { enabled: true })
  }

  const disableManual = (type: string) => {
    updateManualOverride(type, { enabled: false })
  }

  const toggleTagFilter = (tag: string) => {
    setFilterTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }
  const missingRequired = requiredTypes.filter((type) => {
    const selection = selectedComponents[type]
    const manual = manualOverrides[type]
    if (selection?.componentId) return false
    if (manual?.enabled && manual.label.trim()) return false
    return true
  })

  const manualUsed = Object.values(manualOverrides).some((entry) => entry.enabled && entry.label.trim())
  const noCompatTypes = componentOrder.filter((type) => (compatibleByType[type] || []).length === 0)
  const requiredChecklist = requiredTypes.map((type) => componentTypeLabels[type] || type)
  const requiredProgress = `${requiredTypes.length - missingRequired.length}/${requiredTypes.length}`

  const compatLevel = missingRequired.length > 0 ? 'blocked' : noCompatTypes.length ? 'warning' : 'ok'
  const canSave = missingRequired.length === 0

  const summaryItems = componentOrder
    .map((type) => {
      const selection = selectedComponents[type]
      if (selection?.componentId) {
        const component = componentLookup.get(selection.componentId)
        if (!component) return null
        const label = `${component.manufacturer ? `${component.manufacturer} ` : ''}${component.model}${component.part_number ? ` (${component.part_number})` : ''}`
        return { type, label, qty: selection.qty || '1', source: 'catalog' }
      }
      const manual = manualOverrides[type]
      if (manual?.enabled && manual.label.trim()) {
        return { type, label: manual.label, qty: manual.qty || '1', source: 'manual' }
      }
      return null
    })
    .filter((item): item is { type: string; label: string; qty: string; source: string } => Boolean(item))

  const compatibilityText = useMemo(() => {
    if (compatLevel === 'ok') return { label: 'Ready to save', tone: 'good' }
    if (compatLevel === 'warning') return { label: 'Limited compatibility data', tone: 'warn' }
    return { label: 'Missing required selections', tone: 'bad' }
  }, [compatLevel])

  const canGoToStep = (target: Step) => {
    if (target === 1) return true
    if (target === 2) return true
    if (target === 3) return Boolean(selectedModelId)
    if (target === 4) return Boolean(selectedModelId) && missingRequired.length === 0
    return false
  }

  const setStepSafe = (target: Step) => {
    if (canGoToStep(target)) setStep(target)
  }

  const resetConfigurator = () => {
    setSelectedModelId('')
    setPlatformSearch('')
    setFilterManufacturer('')
    setFilterFormFactor('')
    setFilterTags([])
    setSelectedComponents({})
    setManualOverrides({})
    setComponentSearch({})
    setAdvancedValues({})
    setStockByPart({})
    setStockLoading(false)
    setStockChecked({})
    setStep(1)
  }

  const renderComponentRow = (type: string, required: boolean) => {
    const label = componentTypeLabels[type] || type
    const options = compatibleByType[type] || []
    const hasOptions = options.length > 0
    const manual = manualOverrides[type] || { enabled: false, label: '', partNumber: '', qty: '1', notes: '' }
    const manualActive = manual.enabled
    const selection = selectedComponents[type]
    const searchValue = componentSearch[type] || ''
    const filteredOptions = hasOptions
      ? options.filter((option) => {
          if (!searchValue.trim()) return true
          const optionLabel = `${option.manufacturer || ''} ${option.model} ${option.part_number || ''} ${option.tags.join(' ')}`.toLowerCase()
          return optionLabel.includes(searchValue.trim().toLowerCase())
        })
      : []
    const selectedComponent = selection?.componentId ? componentLookup.get(selection.componentId) : null

    return (
      <div key={type} className="componentCard">
        <div className="componentHeader">
          <div style={{ fontWeight: 700 }}>{label}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {required ? <span className="requiredPill">Required</span> : null}
            {hasOptions ? <span style={autoPillStyle}>{options.length} options</span> : <span style={autoPillStyle}>No validated options</span>}
          </div>
        </div>

        {manualActive ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {hasOptions ? (
              <button className="linkBtn" type="button" onClick={() => disableManual(type)}>
                Back to catalog selection
              </button>
            ) : null}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Description</span>
              <input
                value={manual.label}
                onChange={(e) => updateManualOverride(type, { label: e.target.value })}
                placeholder="Manual part description"
                style={{ ...controlStyle, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Part number (optional)</span>
              <input
                value={manual.partNumber}
                onChange={(e) => updateManualOverride(type, { partNumber: e.target.value })}
                placeholder="e.g. INT-4314"
                style={{ ...controlStyle, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Quantity</span>
              <input
                type="number"
                min={0}
                value={manual.qty}
                onChange={(e) => updateManualOverride(type, { qty: e.target.value })}
                placeholder="1"
                style={{ ...controlStyle, padding: '8px 10px' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Notes</span>
              <input
                value={manual.notes}
                onChange={(e) => updateManualOverride(type, { notes: e.target.value })}
                placeholder="Optional notes"
                style={{ ...controlStyle, padding: '8px 10px' }}
              />
            </label>
            {manual.partNumber.trim() ? (
              <div>{renderStockPill(manual.partNumber, manual.qty)}</div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Add a part number to check stock.</div>
            )}
          </div>
        ) : hasOptions ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {options.length > 6 ? (
              <input
                value={searchValue}
                onChange={(e) => setComponentSearch((prev) => ({ ...prev, [type]: e.target.value }))}
                placeholder="Search options"
                style={{ ...controlStyle, padding: '8px 10px' }}
              />
            ) : null}
            <select
              value={selection?.componentId || ''}
              onChange={(e) => updateComponentSelection(type, e.target.value)}
              style={controlStyle}
            >
              <option value="">Select {label}</option>
              {filteredOptions.map((component) => (
                <option key={component.id} value={component.id}>
                  {formatOptionLabel(component)}
                </option>
              ))}
            </select>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Quantity</span>
              <input
                type="number"
                min={0}
                value={selection?.qty || ''}
                onChange={(e) => updateComponentQty(type, e.target.value)}
                placeholder="0"
                style={{ ...controlStyle, padding: '8px 10px' }}
              />
            </label>
            {selectedComponent ? (
              <div style={{ display: 'grid', gap: 6 }}>
                {renderStockPill(selectedComponent.part_number, selection?.qty || '')}
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {selectedComponent.tags.length ? `Tags: ${selectedComponent.tags.slice(0, 4).join(', ')}` : 'No tag data'}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pick an option to see details.</div>
            )}
            <button className="linkBtn" type="button" onClick={() => enableManual(type)}>
              Can&apos;t find it? Add a manual part
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>No validated options yet.</div>
            <button className="linkBtn" type="button" onClick={() => enableManual(type)}>
              Add a manual part
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Configurations</h1>
        <div style={{ color: 'var(--muted)' }}>Pick a platform, choose compatible components, then review and save.</div>
      </div>

      <div className="layout">
        <section style={{ display: 'grid', gap: 14 }}>
          <div className="stepper">
            {[1, 2, 3, 4].map((stepIndex) => {
              const label = stepIndex === 1 ? 'Machine type' : stepIndex === 2 ? 'Platform' : stepIndex === 3 ? 'Configure' : 'Review'
              const active = step === stepIndex
              const enabled = canGoToStep(stepIndex as Step)
              return (
                <button
                  key={stepIndex}
                  type="button"
                  onClick={() => setStepSafe(stepIndex as Step)}
                  disabled={!enabled}
                  className={`step ${active ? 'stepActive' : ''}`}
                >
                  <span className="stepIndex">{stepIndex}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>

          {step === 1 ? (
            <div className="panel">
              <div>
                <div style={{ fontWeight: 900 }}>Step 1: Machine type</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Choose the hardware category to configure.</div>
              </div>
              <div className="chipRow" style={{ marginTop: 10 }}>
                {machineOptions.map((option) => {
                  const active = machineType === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMachineType(option.value)}
                      className={`chip ${active ? 'chipActive' : ''}`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="primaryBtn" type="button" onClick={() => setStepSafe(2)}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="panel">
              <div>
                <div style={{ fontWeight: 900 }}>Step 2: Platform</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Search the catalog once and select a platform model.
                </div>
              </div>
              {catalogLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading catalog...</div> : null}
              {catalogError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{catalogError}</div> : null}
              <div className="platformGrid">
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Search platform</span>
                  <input
                    value={platformSearch}
                    onChange={(e) => setPlatformSearch(e.target.value)}
                    placeholder="Search manufacturer, family, model, tags"
                    style={controlStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Platform model</span>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={catalogLoading || platformResults.length === 0}
                    style={controlStyle}
                  >
                    <option value="">Select platform</option>
                    {platformResults.map((model) => (
                      <option key={model.id} value={model.id}>
                        {formatPlatformLabel(model)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Quick filters</div>
                <div className="chipRow">
                  {manufacturerOptions.slice(0, 6).map((maker) => {
                    const active = filterManufacturer === maker
                    return (
                      <button
                        key={maker}
                        type="button"
                        className={`chip ${active ? 'chipActive' : ''}`}
                        onClick={() => setFilterManufacturer(active ? '' : maker)}
                      >
                        {maker}
                      </button>
                    )
                  })}
                  {formFactorOptions.map((form) => {
                    const active = filterFormFactor === form
                    return (
                      <button
                        key={form}
                        type="button"
                        className={`chip ${active ? 'chipActive' : ''}`}
                        onClick={() => setFilterFormFactor(active ? '' : form)}
                      >
                        {form}
                      </button>
                    )
                  })}
                </div>
                <div className="chipRow">
                  {tagOptions.map((tag) => {
                    const active = filterTags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`chip ${active ? 'chipActive' : ''}`}
                        onClick={() => toggleTagFilter(tag)}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
                {(filterManufacturer || filterFormFactor || filterTags.length) && (
                  <button
                    type="button"
                    className="linkBtn"
                    onClick={() => {
                      setFilterManufacturer('')
                      setFilterFormFactor('')
                      setFilterTags([])
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {selectedModel ? (
                <div className="summaryCard">
                  <div style={{ fontWeight: 900 }}>Platform summary</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatPlatformLabel(selectedModel)}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                    <span style={autoPillStyle} title="Derived from catalog">
                      Form factor: {selectedModel.form_factor || 'Auto'}
                    </span>
                    {selectedModel.tags.slice(0, 6).map((tag) => (
                      <span key={tag} style={autoPillStyle}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button className="ghostBtn" type="button" onClick={() => setStepSafe(1)}>
                  Back
                </button>
                <button className="primaryBtn" type="button" onClick={() => setStepSafe(3)} disabled={!selectedModelId}>
                  Continue to configuration
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="panel">
              <div>
                <div style={{ fontWeight: 900 }}>Step 3: Configure components</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Choose compatible components first. Advanced details are optional.
                </div>
              </div>
              {compatLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading compatibility...</div> : null}
              {compatError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{compatError}</div> : null}
              {selectedModel ? (
                <div className="summaryCard">
                  <div style={{ fontWeight: 900 }}>Selected platform</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatPlatformLabel(selectedModel)}</div>
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>Required components</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Complete required items to proceed: {requiredChecklist.join(', ')} ({requiredProgress} done)
                  </div>
                  <div className="componentGrid">
                    {requiredTypes.map((type) => renderComponentRow(type, true))}
                  </div>
                  {missingRequired.length ? (
                    <div style={{ fontSize: 12, color: 'var(--bad)' }}>
                      Missing required selections: {missingRequired.map((type) => componentTypeLabels[type] || type).join(', ')}
                    </div>
                  ) : null}
                </div>

                {recommendedTypes.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>Recommended components</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Optional but commonly included.</div>
                    <div className="componentGrid">
                      {recommendedTypes.map((type) => renderComponentRow(type, false))}
                    </div>
                  </div>
                ) : null}

                {optionalTypes.length ? (
                  <details className="advancedPanel">
                    <summary style={{ fontWeight: 700 }}>Add more components</summary>
                    <div className="componentGrid" style={{ marginTop: 10 }}>
                      {optionalTypes.map((type) => renderComponentRow(type, false))}
                    </div>
                  </details>
                ) : null}

                <details className="advancedPanel">
                  <summary style={{ fontWeight: 700 }}>Advanced details</summary>
                  <div className="advancedGrid">
                    {(advancedFieldsByMachine[machineType] || []).map((field) => {
                      const value = advancedValues[field.key] || ''
                      if (field.kind === 'readonly') {
                        return (
                          <div key={field.key} className="advancedField">
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{field.label}</div>
                            <span style={autoPillStyle} title="Auto derived from platform or rules">
                              Auto
                            </span>
                          </div>
                        )
                      }
                      if (field.kind === 'select') {
                        return (
                          <label key={field.key} className="advancedField">
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{field.label}</span>
                            <select
                              value={value}
                              onChange={(e) => setAdvancedValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              style={{ ...controlStyle, padding: '8px 10px' }}
                            >
                              <option value="">Select</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </label>
                        )
                      }
                      return (
                        <label key={field.key} className="advancedField">
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{field.label}</span>
                          <input
                            type={field.kind === 'number' ? 'number' : 'text'}
                            value={value}
                            onChange={(e) => setAdvancedValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            style={{ ...controlStyle, padding: '8px 10px' }}
                          />
                        </label>
                      )
                    })}
                  </div>
                </details>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <button className="ghostBtn" type="button" onClick={() => setStepSafe(2)}>
                  Back
                </button>
                <button className="primaryBtn" type="button" onClick={() => setStepSafe(4)} disabled={missingRequired.length > 0}>
                  Review configuration
                </button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="panel">
              <div>
                <div style={{ fontWeight: 900 }}>Step 4: Review</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Confirm the BOM and compatibility status.</div>
              </div>
              <div className="summaryCard">
                <div style={{ fontWeight: 900 }}>Platform</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selectedModel ? formatPlatformLabel(selectedModel) : 'No platform selected'}</div>
              </div>
              <div className="summaryCard">
                <div style={{ fontWeight: 900 }}>Selected components</div>
                {summaryItems.length ? (
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    {summaryItems.map((item) => (
                      <div key={`${item.type}-${item.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                        <div>
                          <strong>{componentTypeLabels[item.type] || item.type}:</strong> {item.label}
                        </div>
                        <div style={{ color: 'var(--muted)' }}>Qty {item.qty}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>No components selected yet.</div>
                )}
              </div>
              <div className="summaryCard">
                <div style={{ fontWeight: 900 }}>Compatibility</div>
                <div className={`statusPill status${compatibilityText.tone}`}>{compatibilityText.label}</div>
                {missingRequired.length ? (
                  <div style={{ fontSize: 12, color: 'var(--bad)' }}>
                    Missing required: {missingRequired.map((type) => componentTypeLabels[type] || type).join(', ')}
                  </div>
                ) : null}
                {manualUsed ? (
                  <div style={{ fontSize: 12, color: '#f7c76a', marginTop: 8 }}>
                    Manual parts added (unverified). Review before quoting.
                  </div>
                ) : null}
                {noCompatTypes.length ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    Limited data for: {noCompatTypes.map((type) => componentTypeLabels[type] || type).join(', ')}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <button className="ghostBtn" type="button" onClick={() => setStepSafe(3)}>
                  Back
                </button>
                <button className="primaryBtn" type="button" disabled={!canSave}>
                  Save configuration
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="summary stickyCard">
          <div style={{ fontWeight: 900 }}>Configuration summary</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selectedModel ? formatPlatformLabel(selectedModel) : 'No platform selected yet.'}</div>

          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <div className={`statusPill status${compatibilityText.tone}`}>{compatibilityText.label}</div>
            {missingRequired.length ? (
              <div style={{ fontSize: 12, color: 'var(--bad)' }}>
                Required: {missingRequired.map((type) => componentTypeLabels[type] || type).join(', ')}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected components</div>
            {summaryItems.length ? (
              <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                {summaryItems.map((item) => (
                  <div key={`${item.type}-${item.label}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>{componentTypeLabels[item.type] || item.type}</div>
                    <div style={{ color: 'var(--muted)' }}>Qty {item.qty}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>No selections yet.</div>
            )}
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Computed placeholders</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={autoPillStyle}>Power draw: Auto</span>
              <span style={autoPillStyle}>Usable capacity: Auto</span>
              <span style={autoPillStyle}>Ports summary: Auto</span>
            </div>
          </div>

          {manualUsed ? (
            <div style={{ fontSize: 12, color: '#f7c76a', marginTop: 12 }}>
              Manual parts added (unverified).
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
            <button className="primaryBtn" type="button" disabled={!canSave}>
              Save configuration
            </button>
            <button className="ghostBtn" type="button">
              Clone configuration
            </button>
            <button className="ghostBtn" type="button" onClick={resetConfigurator}>
              Reset
            </button>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .layout {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr) 320px;
          align-items: start;
        }
        .panel {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          background: var(--panel);
          display: grid;
          gap: 12px;
        }
        .summary {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          background: var(--panel);
          display: grid;
          gap: 8px;
        }
        .stickyCard {
          position: sticky;
          top: 16px;
        }
        .stepper {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }
        .step {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font-weight: 700;
          cursor: pointer;
          transition: border 0.2s ease;
        }
        .step:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .stepActive {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px rgba(90, 180, 255, 0.2);
        }
        .stepIndex {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          font-size: 12px;
        }
        .chipRow {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          color: var(--text);
          font-size: 12px;
          cursor: pointer;
        }
        .chipActive {
          border-color: var(--accent);
          background: rgba(90, 180, 255, 0.15);
        }
        .linkBtn {
          background: none;
          border: none;
          color: var(--accent);
          font-size: 12px;
          cursor: pointer;
          padding: 0;
        }
        .primaryBtn {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .primaryBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .ghostBtn {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          font-weight: 700;
          cursor: pointer;
        }
        .platformGrid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        }
        .summaryCard {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 10px;
          background: var(--panel-2);
          display: grid;
          gap: 6px;
        }
        .componentGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .componentCard {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px;
          background: var(--panel);
          display: grid;
          gap: 10px;
        }
        .componentHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        .requiredPill {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--accent);
          color: var(--accent);
          font-size: 11px;
          font-weight: 700;
          background: rgba(90, 180, 255, 0.12);
        }
        .advancedPanel {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px;
          background: var(--panel);
        }
        .advancedPanel summary {
          cursor: pointer;
        }
        .advancedGrid {
          margin-top: 12px;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .advancedField {
          display: grid;
          gap: 6px;
        }
        .statusPill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid var(--border);
        }
        .statusgood {
          color: #7ce7a0;
          background: rgba(124, 231, 160, 0.1);
        }
        .statuswarn {
          color: #f7c76a;
          background: rgba(247, 199, 106, 0.12);
        }
        .statusbad {
          color: #f78383;
          background: rgba(247, 131, 131, 0.12);
        }
        @media (max-width: 980px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .stickyCard {
            position: static;
          }
        }
      `}</style>
    </main>
  )
}
