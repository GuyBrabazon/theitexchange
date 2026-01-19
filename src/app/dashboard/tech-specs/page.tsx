'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SystemModel = {
  id: string
  tenant_id: string | null
  machine_type: 'server' | 'storage' | 'network'
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

const componentTypeOrder = ['cpu', 'memory', 'drive', 'gpu', 'nic', 'controller', 'transceiver', 'module', 'power', 'cable', 'other']
const componentTypeLabels: Record<string, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  drive: 'Drives',
  gpu: 'GPU',
  nic: 'Network card',
  controller: 'Storage controller',
  transceiver: 'Transceiver',
  module: 'Module',
  power: 'Power',
  cable: 'Cable',
  other: 'Other',
}

const machineOptions = [
  { value: 'server', label: 'Server' },
  { value: 'storage', label: 'Storage' },
  { value: 'network', label: 'Network device' },
] as const

export default function TechSpecsPage() {
  const [machineType, setMachineType] = useState<string>('server')
  const [values, setValues] = useState<Record<string, string>>({})
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string>('')
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('')
  const [selectedFamily, setSelectedFamily] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [compatibleComponents, setCompatibleComponents] = useState<ComponentModel[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState<string>('')
  const [addManufacturer, setAddManufacturer] = useState<string>('')
  const [addSystemId, setAddSystemId] = useState<string>('')
  const [addComponentType, setAddComponentType] = useState<string>(componentTypeOrder[0])
  const [addPartNumber, setAddPartNumber] = useState<string>('')
  const [addDescription, setAddDescription] = useState<string>('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string>('')
  const [addSuccess, setAddSuccess] = useState<string>('')
  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleAddPart = async () => {
    if (!addManufacturer || !addSystemId || !addComponentType || !addPartNumber.trim() || !addDescription.trim()) {
      setAddError('All fields are required.')
      setAddSuccess('')
      return
    }
    setAddLoading(true)
    setAddError('')
    setAddSuccess('')
    try {
      const normalizedPart = addPartNumber.trim().toUpperCase()
      const desc = addDescription.trim()
      const { data: existing, error: existingError } = await supabase
        .from('component_models')
        .select('id')
        .eq('tenant_id', null)
        .eq('part_number', normalizedPart)
        .maybeSingle()
      if (existingError) {
        throw existingError
      }
      let componentId = existing?.id
      if (!componentId) {
      const { data: inserted, error: insertError } = await supabase
        .from('component_models')
          .insert({
            manufacturer: addManufacturer,
            model: normalizedPart,
            part_number: normalizedPart,
            description: desc,
            component_type: addComponentType,
            tenant_id: null,
          })
          .select('id')
          .single()
        if (insertError) {
          throw insertError
        }
        componentId = inserted?.id
      }
      if (!componentId) throw new Error('Unable to create component')
      const { error: compatError } = await supabase.from('compat_rules_global_models').insert({
        system_model_id: addSystemId,
        component_model_id: componentId,
        component_tag: null,
        status: 'verified',
      })
      if (compatError) throw compatError
      setAddSuccess('Component and compatibility relationship saved.')
      setAddPartNumber('')
      setAddDescription('')
      setAddSystemId('')
      setAddComponentType(componentTypeOrder[0])
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to add part'
      setAddError(msg)
    } finally {
      setAddLoading(false)
    }
  }

  useEffect(() => {
    const loadCatalog = async () => {
      setCatalogLoading(true)
      setCatalogError('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined
        const params = new URLSearchParams()
        params.set('machine_type', machineType)

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
              machine_type: machineTypeRaw as SystemModel['machine_type'],
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
    setSelectedManufacturer('')
    setSelectedFamily('')
    setSelectedModelId('')
    setCompatibleComponents([])
    setCompatError('')
    setAddManufacturer('')
    setAddSystemId('')
    setAddComponentType(componentTypeOrder[0])
    setAddPartNumber('')
    setAddDescription('')
    setAddError('')
    setAddSuccess('')
  }, [machineType])

  useEffect(() => {
    setSelectedFamily('')
    setSelectedModelId('')
    setAddSystemId('')
    setAddComponentType(componentTypeOrder[0])
  }, [selectedManufacturer])

  useEffect(() => {
    setSelectedModelId('')
  }, [selectedFamily])

  const filteredModels = useMemo(() => systemModels.filter((m) => m.machine_type === machineType), [systemModels, machineType])

  const manufacturerOptions = useMemo(() => {
    const set = new Set(filteredModels.map((m) => m.manufacturer).filter(Boolean))
    return Array.from(set).sort()
  }, [filteredModels])

  const familyOptions = useMemo(() => {
    const set = new Set(
      filteredModels
        .filter((m) => !selectedManufacturer || m.manufacturer === selectedManufacturer)
        .map((m) => m.family || '')
        .filter(Boolean)
    )
    return Array.from(set).sort()
  }, [filteredModels, selectedManufacturer])

  const modelOptions = useMemo(() => {
    return filteredModels
      .filter((m) => (!selectedManufacturer || m.manufacturer === selectedManufacturer) && (!selectedFamily || (m.family || '') === selectedFamily))
      .sort((a, b) => a.model.localeCompare(b.model))
  }, [filteredModels, selectedManufacturer, selectedFamily])

  const selectedModel = useMemo(() => modelOptions.find((m) => m.id === selectedModelId) || null, [modelOptions, selectedModelId])
  const addSystemOptions = useMemo(
    () =>
      filteredModels.filter((model) => {
        if (addManufacturer && model.manufacturer !== addManufacturer) return false
        return true
      }),
    [filteredModels, addManufacturer]
  )

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
          const componentType = componentTypeOrder.includes(rawType) ? rawType : 'other'
          const tags = Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : []
          return {
            id: String(row.id ?? ''),
            tenant_id: row.tenant_id ? String(row.tenant_id) : null,
            component_type: componentType,
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

  const compatibleByType = useMemo(() => {
    const groups: Record<string, ComponentModel[]> = {}
    for (const component of compatibleComponents) {
      const key = component.component_type || 'other'
      if (!groups[key]) groups[key] = []
      groups[key].push(component)
    }
    return groups
  }, [compatibleComponents])

  const compatibleTypes = useMemo(() => {
    const keys = Object.keys(compatibleByType)
    const ordered = componentTypeOrder.filter((type) => keys.includes(type))
    const extra = keys.filter((type) => !ordered.includes(type)).sort()
    return [...ordered, ...extra]
  }, [compatibleByType])

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Tech Specs</h1>
        <div style={{ color: 'var(--muted)' }}>Browse compatibility rules and validate component options.</div>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          background: 'var(--panel)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 900 }}>Compatibility lookup</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Select a platform to view compatible parts.</div>
        </div>
        {catalogLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading catalog...</div> : null}
        {catalogError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{catalogError}</div> : null}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Machine type</span>
            <select
              value={machineType}
              onChange={(e) => setMachineType(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' }}
            >
              {machineOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Manufacturer</span>
            <select
              value={selectedManufacturer}
              onChange={(e) => setSelectedManufacturer(e.target.value)}
              disabled={catalogLoading || manufacturerOptions.length === 0}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' }}
            >
              <option value="">Select manufacturer</option>
              {manufacturerOptions.map((maker) => (
                <option key={maker} value={maker}>
                  {maker}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Family</span>
            <select
              value={selectedFamily}
              onChange={(e) => setSelectedFamily(e.target.value)}
              disabled={catalogLoading || familyOptions.length === 0}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' }}
            >
              <option value="">Select family</option>
              {familyOptions.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Model</span>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              disabled={catalogLoading || modelOptions.length === 0}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' }}
            >
              <option value="">Select model</option>
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.model}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {selectedModel ? (
            <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
              <div>
                <strong>Selected:</strong> {selectedModel.manufacturer} {selectedModel.model}
              </div>
              <div style={{ color: 'var(--muted)' }}>
                Form factor: {selectedModel.form_factor || 'n/a'} - Tags: {selectedModel.tags.length ? selectedModel.tags.join(', ') : 'none'}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Select a model to load compatibility.</div>
          )}
          <div style={{ fontWeight: 900, marginTop: 6 }}>Compatible components</div>
          {compatLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading compatible parts...</div> : null}
          {compatError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{compatError}</div> : null}
          {selectedModelId && compatibleTypes.length === 0 && !compatLoading ? (
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>No compatibility rules yet for this model.</div>
          ) : null}
          {compatibleTypes.length ? (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {compatibleTypes.map((type) => {
                const options = compatibleByType[type] || []
                const fieldKey = `compat_${type}`
                const value = values[fieldKey] || ''
                return (
                  <label key={type} style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{componentTypeLabels[type] || type}</span>
                    <select
                      value={value}
                      onChange={(e) => setValue(fieldKey, e.target.value)}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' }}
                    >
                      <option value="">Select {componentTypeLabels[type] || type}</option>
                      {options.map((component) => (
                        <option key={component.id} value={component.id}>
                          {(component.manufacturer ? `${component.manufacturer} ` : '') + component.model}
                          {component.part_number ? ` (${component.part_number})` : ''}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{options.length} compatible options</span>
                  </label>
                )
              })}
            </div>
          ) : null}
        <section className="addPartSection">
          <div className="sectionHeader">
            <h2>Add part numbers & relationships</h2>
            <div>Add part numbers and compatibility relationships.</div>
          </div>
          <div className="addFormGrid">
            <label>
              <span>OEM</span>
              <select value={addManufacturer} onChange={(event) => setAddManufacturer(event.target.value)}>
                <option value="">Select OEM</option>
                {manufacturerOptions.map((maker) => (
                  <option key={maker} value={maker}>
                    {maker}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>System</span>
              <select value={addSystemId} onChange={(event) => setAddSystemId(event.target.value)} disabled={!addManufacturer}>
                <option value="">Select system</option>
                {addSystemOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Component type</span>
              <select value={addComponentType} onChange={(event) => setAddComponentType(event.target.value)}>
                {componentTypeOrder.map((type) => (
                  <option key={type} value={type}>
                    {componentTypeLabels[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Part number</span>
              <input value={addPartNumber} onChange={(event) => setAddPartNumber(event.target.value)} placeholder="Part number" />
            </label>
            <label>
              <span>Description</span>
              <input value={addDescription} onChange={(event) => setAddDescription(event.target.value)} placeholder="Description" />
            </label>
          </div>
          <div className="addActions">
            <button type="button" className="primaryBtn" disabled={addLoading} onClick={handleAddPart}>
              {addLoading ? 'Adding…' : 'Add'}
            </button>
          </div>
          {addError ? <div className="formFeedback error">{addError}</div> : null}
          {addSuccess ? <div className="formFeedback success">{addSuccess}</div> : null}
        </section>
        </div>
      </div>
      <style jsx>{`
        .addPartSection {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px;
          background: var(--panel);
          display: grid;
          gap: 12px;
        }
        .sectionHeader {
          display: grid;
          gap: 4px;
        }
        .sectionHeader h2 {
          margin: 0;
        }
        .sectionHeader > div {
          color: var(--muted);
          font-size: 12px;
        }
        .addFormGrid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .addFormGrid label {
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
        }
        .addFormGrid select,
        .addFormGrid input {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          color: var(--text);
          font: inherit;
        }
        .addActions {
          display: flex;
          justify-content: flex-end;
        }
        .formFeedback {
          font-size: 12px;
          padding: 8px 12px;
          border-radius: 10px;
        }
        .formFeedback.error {
          background: rgba(247, 131, 131, 0.16);
          color: #f78383;
        }
        .formFeedback.success {
          background: rgba(124, 231, 160, 0.12);
          color: #7ce7a0;
        }
      `}</style>
    </main>
  )
}
