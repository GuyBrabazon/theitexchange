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
  const [machineType, setMachineType] = useState<MachineType>('server')
  const [configName, setConfigName] = useState('')
  const [configQty, setConfigQty] = useState('1')
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

  return (
    <main className="configPage">
      <div className="pageHeader">
        <h1>Configurations</h1>
        <div className="subText">Build a platform configuration quickly with catalog-driven compatibility.</div>
      </div>

      <div className="tabBar">
        {machineOptions.map((option) => {
          const active = machineType === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setMachineType(option.value)}
              className={`tabBtn ${active ? 'tabActive' : ''}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="configCard">
        <div className="configHeader">
          <div>
            <div className="configTitle">Configuration Details</div>
            <div className="configSubtitle">Select a platform model, then fill components in the sections below.</div>
          </div>
          <div className="configFieldGrid">
            <label className="field">
              <span className="fieldLabel">Configuration Name</span>
              <input
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g. Web Server Cluster"
                style={controlStyle}
              />
            </label>
            <label className="field">
              <span className="fieldLabel">Machine Type</span>
              <select value={machineType} onChange={(e) => setMachineType(e.target.value as MachineType)} style={controlStyle}>
                {machineOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="fieldLabel">Quantity</span>
              <input
                type="number"
                min={1}
                value={configQty}
                onChange={(e) => setConfigQty(e.target.value)}
                placeholder="1"
                style={controlStyle}
              />
            </label>
          </div>
        </div>

        <div className="configLayout">
          <div className="configLeft">
            <details className="accordion" open>
              <summary>Platform Details</summary>
              <div className="accordionBody">
                {catalogLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading catalog...</div> : null}
                {catalogError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{catalogError}</div> : null}
                <div className="configFieldGrid">
                  <label className="field">
                    <span className="fieldLabel">Search platform</span>
                    <input
                      value={platformSearch}
                      onChange={(e) => setPlatformSearch(e.target.value)}
                      placeholder="Search manufacturer, family, model, tags"
                      style={controlStyle}
                    />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Platform model</span>
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

                <div className="configFieldGrid">
                  <label className="field">
                    <span className="fieldLabel">Manufacturer</span>
                    <select value={filterManufacturer} onChange={(e) => setFilterManufacturer(e.target.value)} style={controlStyle}>
                      <option value="">All manufacturers</option>
                      {manufacturerOptions.map((maker) => (
                        <option key={maker} value={maker}>
                          {maker}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Form factor</span>
                    <select value={filterFormFactor} onChange={(e) => setFilterFormFactor(e.target.value)} style={controlStyle}>
                      <option value="">All form factors</option>
                      {formFactorOptions.map((form) => (
                        <option key={form} value={form}>
                          {form}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <div className="fieldLabel">Tags</div>
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
                  {filterManufacturer || filterFormFactor || filterTags.length ? (
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
                  ) : null}
                </div>

                {selectedModel ? (
                  <div className="summaryCard">
                    <div style={{ fontWeight: 900 }}>Platform summary</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatPlatformLabel(selectedModel)}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      <span style={autoPillStyle}>Form factor: {selectedModel.form_factor || 'Auto'}</span>
                      {selectedModel.tags.slice(0, 6).map((tag) => (
                        <span key={tag} style={autoPillStyle}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>

            <details className="accordion" open>
              <summary>Required Components</summary>
              <div className="accordionBody">
                {compatLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading compatibility...</div> : null}
                {compatError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{compatError}</div> : null}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Complete required items to proceed: {requiredChecklist.join(', ')} ({requiredProgress} done)
                </div>
                <div className="componentGrid">{requiredTypes.map((type) => renderComponentRow(type, true))}</div>
                {missingRequired.length ? (
                  <div style={{ fontSize: 12, color: 'var(--bad)' }}>
                    Missing required selections: {missingRequired.map((type) => componentTypeLabels[type] || type).join(', ')}
                  </div>
                ) : null}
              </div>
            </details>

            {recommendedTypes.length ? (
              <details className="accordion" open>
                <summary>Recommended Components</summary>
                <div className="accordionBody">
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Optional but commonly included.</div>
                  <div className="componentGrid">{recommendedTypes.map((type) => renderComponentRow(type, false))}</div>
                </div>
              </details>
            ) : null}

            {optionalTypes.length ? (
              <details className="accordion">
                <summary>Add More Components</summary>
                <div className="accordionBody">
                  <div className="componentGrid">{optionalTypes.map((type) => renderComponentRow(type, false))}</div>
                </div>
              </details>
            ) : null}

            <details className="accordion">
              <summary>Advanced Details</summary>
              <div className="accordionBody">
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
              </div>
            </details>
          </div>

          <aside className="summaryPanel stickyCard">
            <div className="summaryTitle">Overview / Summary</div>
            <div className="summaryList">
              <div className="summaryItem">
                <span className="summaryCheck">✓</span>
                <span>
                  Configuration: <strong>{configName.trim() || 'Untitled configuration'}</strong>
                </span>
              </div>
              <div className="summaryItem">
                <span className="summaryCheck">✓</span>
                <span>
                  Machine Type: <strong>{machineOptions.find((opt) => opt.value === machineType)?.label || 'Unknown'}</strong>
                </span>
              </div>
              <div className="summaryItem">
                <span className="summaryCheck">✓</span>
                <span>
                  Quantity: <strong>{configQty || '1'}</strong>
                </span>
              </div>
              <div className="summaryItem">
                <span className="summaryCheck">✓</span>
                <span>
                  Platform: <strong>{selectedModel ? formatPlatformLabel(selectedModel) : 'Not selected'}</strong>
                </span>
              </div>
            </div>

            <div className={`statusPill status${compatibilityText.tone}`}>{compatibilityText.label}</div>
            {missingRequired.length ? (
              <div style={{ fontSize: 12, color: 'var(--bad)' }}>
                Missing required: {missingRequired.map((type) => componentTypeLabels[type] || type).join(', ')}
              </div>
            ) : null}
            {manualUsed ? (
              <div style={{ fontSize: 12, color: '#f7c76a' }}>
                Manual parts added (unverified). Review before quoting.
              </div>
            ) : null}

            <div className="summarySectionTitle">Selected components</div>
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

            <div className="summarySectionTitle">Computed placeholders</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={autoPillStyle}>Power draw: Auto</span>
              <span style={autoPillStyle}>Usable capacity: Auto</span>
              <span style={autoPillStyle}>Ports summary: Auto</span>
            </div>

            <div className="summaryActions">
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
      </div>

      <style jsx>{`
        .configPage {
          padding: 24px;
          display: grid;
          gap: 16px;
        }
        .pageHeader {
          display: grid;
          gap: 6px;
        }
        .subText {
          color: var(--muted);
          font-size: 13px;
        }
        .tabBar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          background: var(--panel);
        }
        .tabBtn {
          padding: 12px 16px;
          border: none;
          border-right: 1px solid var(--border);
          background: var(--panel);
          color: var(--muted);
          font-weight: 800;
          cursor: pointer;
        }
        .tabBtn:last-child {
          border-right: none;
        }
        .tabActive {
          background: rgba(90, 180, 255, 0.18);
          color: var(--text);
        }
        .configCard {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          background: var(--panel);
          display: grid;
          gap: 16px;
        }
        .configHeader {
          display: grid;
          gap: 12px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 12px;
        }
        .configTitle {
          font-weight: 900;
        }
        .configSubtitle {
          font-size: 12px;
          color: var(--muted);
        }
        .configFieldGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .field {
          display: grid;
          gap: 6px;
        }
        .fieldLabel {
          font-size: 12px;
          color: var(--muted);
        }
        .configLayout {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr) 320px;
          align-items: start;
        }
        .configLeft {
          display: grid;
          gap: 12px;
        }
        .accordion {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--panel);
          overflow: hidden;
        }
        .accordion summary {
          list-style: none;
          padding: 10px 12px;
          background: var(--panel-2);
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .accordion summary::-webkit-details-marker {
          display: none;
        }
        .accordion summary::after {
          content: '▾';
          margin-left: auto;
          color: var(--muted);
          transition: transform 0.2s ease;
        }
        .accordion[open] summary::after {
          transform: rotate(180deg);
        }
        .accordionBody {
          padding: 12px;
          display: grid;
          gap: 12px;
        }
        .summaryPanel {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
          background: var(--panel);
          display: grid;
          gap: 10px;
        }
        .summaryTitle {
          font-weight: 900;
        }
        .summaryList {
          display: grid;
          gap: 8px;
          font-size: 12px;
        }
        .summaryItem {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .summaryCheck {
          color: #7ce7a0;
          font-weight: 900;
        }
        .summarySectionTitle {
          font-weight: 700;
          margin-top: 6px;
        }
        .summaryActions {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }
        .stickyCard {
          position: sticky;
          top: 16px;
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
        .advancedGrid {
          margin-top: 4px;
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
          .configLayout {
            grid-template-columns: 1fr;
          }
          .stickyCard {
            position: static;
          }
          .tabBar {
            grid-template-columns: 1fr;
          }
          .tabBtn {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .tabBtn:last-child {
            border-bottom: none;
          }
        }
      `}</style>
    </main>
  )

}
