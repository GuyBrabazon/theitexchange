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
      const payload = {
        manufacturer: addManufacturer,
        system_model_id: addSystemId,
        component_type: addComponentType,
        part_number: addPartNumber.trim().toUpperCase(),
        description: addDescription.trim(),
      }
      const res = await fetch('/api/catalog/add-part-relationship', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { ok: boolean; message?: string }
      if (!json.ok) {
        throw new Error(json.message || 'Failed to add part')
      }
      setAddSuccess(json.message || 'Component and compatibility relationship saved.')
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
    <main className="techPage">
      <header className="hero">
        <div>
          <h1>Tech Specs</h1>
          <p className="mutedText">Browse compatibility rules and validate component options.</p>
        </div>
      </header>

      <div className="techGrid">
        <section className="card compatCard">
          <div className="sectionHeader">
            <h2>Compatibility lookup</h2>
            <p className="sectionDescription">Select a platform to view compatible parts.</p>
          </div>
          {catalogLoading ? <p className="statusNote">Loading catalog...</p> : null}
          {catalogError ? <p className="statusNote error">{catalogError}</p> : null}
          <div className="formGrid">
            <label className="fieldGroup">
              <span>Machine type</span>
              <select value={machineType} onChange={(e) => setMachineType(e.target.value)}>
                {machineOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Manufacturer</span>
              <select
                value={selectedManufacturer}
                onChange={(e) => setSelectedManufacturer(e.target.value)}
                disabled={catalogLoading || manufacturerOptions.length === 0}
              >
                <option value="">Select manufacturer</option>
                {manufacturerOptions.map((maker) => (
                  <option key={maker} value={maker}>
                    {maker}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Family</span>
              <select
                value={selectedFamily}
                onChange={(e) => setSelectedFamily(e.target.value)}
                disabled={catalogLoading || familyOptions.length === 0}
              >
                <option value="">Select family</option>
                {familyOptions.map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Model</span>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                disabled={catalogLoading || modelOptions.length === 0}
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
          <div className="compatSummary">
            {selectedModel ? (
              <div className="modelDetails">
                <div>
                  <strong>Selected:</strong> {selectedModel.manufacturer} {selectedModel.model}
                </div>
                <div className="mutedText">
                  Form factor: {selectedModel.form_factor || 'n/a'} - Tags:{' '}
                  {selectedModel.tags.length ? selectedModel.tags.join(', ') : 'none'}
                </div>
              </div>
            ) : (
              <p className="statusNote muted">Select a model to load compatibility.</p>
            )}
            <div className="compatListHeader">
              <strong>Compatible components</strong>
            </div>
            {compatLoading ? <p className="statusNote">Loading compatible parts...</p> : null}
            {compatError ? <p className="statusNote error">{compatError}</p> : null}
            {selectedModelId && compatibleTypes.length === 0 && !compatLoading ? (
              <p className="statusNote muted">No compatibility rules yet for this model.</p>
            ) : null}
            {compatibleTypes.length ? (
              <div className="compatGrid">
                {compatibleTypes.map((type) => {
                  const options = compatibleByType[type] || []
                  const fieldKey = `compat_${type}`
                  const value = values[fieldKey] || ''
                  return (
                    <label key={type} className="compatField">
                      <span>{componentTypeLabels[type] || type}</span>
                      <select value={value} onChange={(e) => setValue(fieldKey, e.target.value)}>
                        <option value="">Select {componentTypeLabels[type] || type}</option>
                        {options.map((component) => (
                          <option key={component.id} value={component.id}>
                            {(component.manufacturer ? `${component.manufacturer} ` : '') + component.model}
                            {component.part_number ? ` (${component.part_number})` : ''}
                          </option>
                        ))}
                      </select>
                      <span className="optionMeta">{options.length} compatible options</span>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="sectionHeader">
            <h2>Add part numbers & relationships</h2>
            <p className="sectionDescription">Add part numbers and compatibility relationships.</p>
          </div>
          <div className="formGrid">
            <label className="fieldGroup">
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
            <label className="fieldGroup">
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
            <label className="fieldGroup">
              <span>Component type</span>
              <select value={addComponentType} onChange={(event) => setAddComponentType(event.target.value)}>
                {componentTypeOrder.map((type) => (
                  <option key={type} value={type}>
                    {componentTypeLabels[type] ?? type}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldGroup">
              <span>Part number</span>
              <input value={addPartNumber} onChange={(event) => setAddPartNumber(event.target.value)} placeholder="Part number" />
            </label>
            <label className="fieldGroup">
              <span>Description</span>
              <input value={addDescription} onChange={(event) => setAddDescription(event.target.value)} placeholder="Description" />
            </label>
          </div>
          <div className="addActions">
            <button type="button" className="primaryBtn" disabled={addLoading} onClick={handleAddPart}>
              {addLoading ? 'Adding...' : 'Add'}
            </button>
          </div>
          {addError ? <div className="formFeedback error">{addError}</div> : null}
          {addSuccess ? <div className="formFeedback success">{addSuccess}</div> : null}
        </section>
      </div>
      <style jsx>{`
        .techPage {
          padding: 24px;
          display: grid;
          gap: 16px;
        }
        .hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .hero h1 {
          margin: 0;
          font-size: 28px;
        }
        .mutedText {
          color: var(--muted);
          font-size: 14px;
        }
        .techGrid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        }
        .card {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px;
          background: var(--panel);
          display: grid;
          gap: 16px;
        }
        .sectionHeader {
          display: grid;
          gap: 4px;
        }
        .sectionHeader h2 {
          margin: 0;
          font-size: 20px;
        }
        .sectionDescription {
          color: var(--muted);
          font-size: 13px;
        }
        .formGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .fieldGroup {
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
        }
        .fieldGroup span,
        .compatField span {
          font-size: 11px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .formGrid select,
        .formGrid input,
        .compatField select {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          color: var(--text);
          font: inherit;
        }
        .statusNote {
          margin: 0;
          font-size: 12px;
          color: var(--muted);
        }
        .statusNote.error {
          color: var(--bad);
        }
        .statusNote.muted {
          color: var(--muted);
        }
        .compatSummary {
          display: grid;
          gap: 12px;
        }
        .modelDetails {
          display: grid;
          gap: 3px;
          font-size: 13px;
        }
        .compatListHeader {
          font-weight: 600;
          font-size: 14px;
        }
        .compatGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .compatField {
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
        }
        .optionMeta {
          font-size: 11px;
          color: var(--muted);
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
        @media (max-width: 600px) {
          .techGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

    </main>
  )
}
