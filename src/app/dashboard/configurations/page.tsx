'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

type SelectOption = {
  value: string
  label: string
  searchText?: string
  disabled?: boolean
}

const multiSelectTypes = new Set(['memory', 'drive'])

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
  controller: 'Storage Controller',
  transceiver: 'Transceiver',
  module: 'Module',
  power: 'Power Supplies',
  cable: 'Cable',
  rail: 'Rail kit',
  bezel: 'Bezel',
  remote_access: 'Remote Access',
  other: 'Other',
}

const componentOrderByMachine: Record<MachineType, string[]> = {
  server: ['cpu', 'memory', 'drive', 'controller', 'nic', 'gpu', 'power', 'remote_access', 'rail', 'bezel', 'transceiver', 'module', 'cable', 'other'],
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

type SearchableSelectBaseProps = {
  options: SelectOption[]
  placeholder: string
  disabled?: boolean
  searchPlaceholder?: string
  emptyLabel?: string
  width?: number | string
}

type SearchableSelectProps =
  | (SearchableSelectBaseProps & {
      value: string
      onChange: (value: string) => void
      multiple?: false
    })
  | (SearchableSelectBaseProps & {
      value: string[]
      onChange: (value: string[]) => void
      multiple: true
    })

function SearchableSelect(props: SearchableSelectProps) {
  const {
    value,
    options,
    placeholder,
    disabled,
    searchPlaceholder = 'Search',
    emptyLabel = 'No results',
    width = '100%',
  } = props
  const isMulti = props.multiple === true
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const listId = useRef(`select-${Math.random().toString(36).slice(2)}`).current

  const selectedValues = Array.isArray(value) ? value : value ? [value] : []
  const selectedOption = !isMulti ? options.find((option) => option.value === value) : null
  const displayLabel = isMulti
    ? selectedValues.length === 0
      ? placeholder
      : selectedValues.length === 1
        ? options.find((option) => option.value === selectedValues[0])?.label || '1 selected'
        : `${selectedValues.length} selected`
    : selectedOption
      ? selectedOption.label
      : placeholder

  const filteredOptions = useMemo(() => {
    const loweredQuery = query.trim().toLowerCase()
    if (!loweredQuery) return options
    return options.filter((option) => (option.searchText || option.label).toLowerCase().includes(loweredQuery))
  }, [options, query])

  const hasSelection = isMulti ? selectedValues.length > 0 : Boolean(selectedOption)
  const rootStyle = typeof width === 'number' ? { width: `${width}px` } : { width }

  useEffect(() => {
    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
      }
    }

    function onDocKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setQuery('')
        setActiveIndex(-1)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const selectedIndex = filteredOptions.findIndex((option) => selectedValues.includes(option.value))
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : filteredOptions.length ? 0 : -1)
    requestAnimationFrame(() => searchRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!listRef.current) return
    if (activeIndex < 0) return
    const el = listRef.current.querySelector<HTMLLIElement>(`li[data-idx="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  useEffect(() => {
    if (!open) return
    if (filteredOptions.length === 0) {
      setActiveIndex(-1)
      return
    }
    setActiveIndex((prev) => Math.min(Math.max(prev, 0), filteredOptions.length - 1))
  }, [filteredOptions, open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const commit = (option: SelectOption) => {
    if (option.disabled) return
    if (isMulti) {
      const checked = selectedValues.includes(option.value)
      const next = checked ? selectedValues.filter((item) => item !== option.value) : [...selectedValues, option.value]
      ;(props as Extract<SearchableSelectProps, { multiple: true }>).onChange(next)
      return
    }
    ;(props as Extract<SearchableSelectProps, { multiple?: false }>).onChange(option.value)
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
    buttonRef.current?.focus()
  }

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const onSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0 && filteredOptions[activeIndex]) {
        commit(filteredOptions[activeIndex])
      }
    } else if (event.key === 'Tab') {
      setOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
  }

  return (
    <div className="selectWrap" ref={rootRef} style={rootStyle}>
      <button
        ref={buttonRef}
        type="button"
        className={`selectTrigger ${open ? 'selectTriggerOpen' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          setOpen((prev) => !prev)
          if (!open) setQuery('')
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={`selectValue ${!hasSelection ? 'selectPlaceholder' : ''}`}>{displayLabel}</span>
        <svg className={`selectChevron ${open ? 'selectChevronOpen' : ''}`} viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M5.5 7.75L10 12.25L14.5 7.75"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="selectMenu" role="dialog" aria-label="Select option">
          <div className="selectSearchWrap">
            <svg className="selectSearchIcon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9 15.5a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" stroke="currentColor" strokeWidth="1.6" />
              <path d="M14.2 14.2 17.5 17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={searchPlaceholder}
              className="selectSearch"
              autoComplete="off"
              aria-label="Search options"
            />
          </div>

          <ul
            ref={listRef}
            className="selectList"
            role="listbox"
            aria-multiselectable={isMulti || undefined}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
          >
            {filteredOptions.length === 0 ? (
              <li className="selectEmpty">{emptyLabel}</li>
            ) : (
              filteredOptions.map((option, idx) => {
                const isSelected = selectedValues.includes(option.value)
                const isActive = idx === activeIndex
                return (
                  <li
                    key={option.value}
                    id={`${listId}-opt-${idx}`}
                    data-idx={idx}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(option)}
                    className={`selectOption ${isActive ? 'selectOptionFocused' : ''} ${isSelected ? 'selectOptionSelected' : ''} ${
                      option.disabled ? 'selectOptionDisabled' : ''
                    }`}
                  >
                    <span className={`selectOptionLabel ${!isSelected ? 'selectOptionMuted' : ''}`}>{option.label}</span>
                    {isMulti ? (
                      <input className="selectCheckbox" type="checkbox" checked={isSelected} readOnly />
                    ) : isSelected ? (
                      <svg className="selectCheck" viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          d="M16.5 5.75 8.5 13.75 3.5 8.75"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </li>
                )
              })
            )}
          </ul>

          {hasSelection ? (
            <div className="selectFooter">
              <button
                type="button"
                className="selectFooterBtn"
                onClick={() => {
                  if (isMulti) {
                    ;(props as Extract<SearchableSelectProps, { multiple: true }>).onChange([])
                    return
                  }
                  ;(props as Extract<SearchableSelectProps, { multiple?: false }>).onChange('')
                  setOpen(false)
                }}
              >
                Clear selection
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default function ConfigurationsPage() {
  const [machineType, setMachineType] = useState<MachineType>('server')
  const [configName, setConfigName] = useState('')
  const [configQty, setConfigQty] = useState('1')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])

  const [selectedManufacturer, setSelectedManufacturer] = useState('')
  const [selectedFamily, setSelectedFamily] = useState('')
  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedChassisId, setSelectedChassisId] = useState('')

  const [compatibleComponents, setCompatibleComponents] = useState<ComponentModel[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState('')

  const [selectedComponents, setSelectedComponents] = useState<Record<string, ComponentSelection[]>>({})
  const [manualOverrides, setManualOverrides] = useState<Record<string, ManualEntry>>({})
  const [advancedValues, setAdvancedValues] = useState<Record<string, string>>({})
  const [stockByPart, setStockByPart] = useState<Record<string, number>>({})
  const [stockLoading, setStockLoading] = useState(false)
  const [stockChecked, setStockChecked] = useState<Record<string, boolean>>({})

  const filteredModels = useMemo(() => systemModels.filter((m) => m.machine_type === machineType), [systemModels, machineType])

  const manufacturerOptions = useMemo(() => {
    const list = filteredModels.map((model) => model.manufacturer).filter(Boolean)
    return Array.from(new Set(list)).sort()
  }, [filteredModels])

  const familyOptions = useMemo(() => {
    const list = filteredModels
      .filter((model) => !selectedManufacturer || model.manufacturer === selectedManufacturer)
      .map((model) => model.family)
      .filter((family): family is string => Boolean(family && family.trim()))
    return Array.from(new Set(list)).sort()
  }, [filteredModels, selectedManufacturer])

  const modelOptions = useMemo(() => {
    return filteredModels
      .filter(
        (model) =>
          (!selectedManufacturer || model.manufacturer === selectedManufacturer) &&
          (!selectedFamily || (model.family || '') === selectedFamily)
      )
      .sort((a, b) => {
        const maker = a.manufacturer.localeCompare(b.manufacturer)
        if (maker !== 0) return maker
        const family = (a.family || '').localeCompare(b.family || '')
        if (family !== 0) return family
        return a.model.localeCompare(b.model)
      })
  }, [filteredModels, selectedManufacturer, selectedFamily])

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
    if (!component.part_number) return `${base} - Stock: n/a`
    const key = normalizePartNumber(component.part_number)
    const checked = Object.prototype.hasOwnProperty.call(stockChecked, key)
    const stockQty = getStockQty(component.part_number)
    if (!checked) return `${base} - Stock: n/a`
    if (stockQty == null) return `${base} - Stock: ${stockLoading ? '...' : 'No stock'}`
    return `${base} - ${stockQty > 0 ? 'In stock' : 'No stock'}`
  }

  const buildComponentSearchText = (component: ComponentModel) => {
    return `${component.manufacturer || ''} ${component.oem || ''} ${component.category || ''} ${component.model} ${
      component.part_number || ''
    } ${component.description || ''} ${component.tags.join(' ')}`.toLowerCase()
  }

  const buildComponentOptions = (options: ComponentModel[]): SelectOption[] => {
    return options.map((component) => ({
      value: component.id,
      label: formatOptionLabel(component),
      searchText: buildComponentSearchText(component),
    }))
  }

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
    setSelectedManufacturer('')
    setSelectedFamily('')
    setSelectedModelId('')
    setSelectedChassisId('')
    setSelectedComponents({})
    setManualOverrides({})
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
    setAdvancedValues({})
    setCompatError('')
    setSelectedChassisId('')
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
          const typeSource =
            typeof row.component_type === 'string' && row.component_type.trim()
              ? row.component_type
              : typeof row.category === 'string'
                ? row.category
                : ''
          const rawType = typeSource.trim().toLowerCase()
          let mappedType = rawType
          if (!Object.prototype.hasOwnProperty.call(componentTypeLabels, mappedType)) {
            if (mappedType.includes('cpu') || mappedType.includes('processor')) mappedType = 'cpu'
            else if (mappedType.includes('mem') || mappedType.includes('dimm') || mappedType.includes('ram')) mappedType = 'memory'
            else if (
              mappedType.includes('drive') ||
              mappedType.includes('disk') ||
              mappedType.includes('storage') ||
              mappedType.includes('ssd') ||
              mappedType.includes('hdd')
            )
              mappedType = 'drive'
            else if (mappedType.includes('nic') || mappedType.includes('network') || mappedType.includes('ethernet')) mappedType = 'nic'
            else if (mappedType.includes('gpu') || mappedType.includes('graphics')) mappedType = 'gpu'
            else if (mappedType.includes('controller') || mappedType.includes('raid')) mappedType = 'controller'
            else if (mappedType.includes('transceiver') || mappedType.includes('optic') || mappedType.includes('sfp') || mappedType.includes('qsfp'))
              mappedType = 'transceiver'
            else if (mappedType.includes('module')) mappedType = 'module'
            else if (mappedType.includes('power') || mappedType.includes('psu') || mappedType.includes('power supply')) mappedType = 'power'
            else if (mappedType.includes('rail')) mappedType = 'rail'
            else if (mappedType.includes('bezel')) mappedType = 'bezel'
            else if (mappedType.includes('license') || mappedType.includes('remote') || mappedType.includes('idrac') || mappedType.includes('ilo'))
              mappedType = 'remote_access'
            else if (mappedType.includes('cable')) mappedType = 'cable'
            else mappedType = 'other'
          }
          const tags = Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : []
          const manufacturer =
            typeof row.manufacturer === 'string' && row.manufacturer.trim()
              ? row.manufacturer
              : typeof row.oem === 'string'
                ? row.oem
                : null
          const description = typeof row.description === 'string' ? row.description : null
          const category = typeof row.category === 'string' ? row.category : null
          const oem = typeof row.oem === 'string' ? row.oem : null
          return {
            id: String(row.id ?? ''),
            tenant_id: row.tenant_id ? String(row.tenant_id) : null,
            component_type: mappedType,
            manufacturer,
            model: String(row.model ?? row.description ?? ''),
            part_number: typeof row.part_number === 'string' ? row.part_number : null,
            category,
            oem,
            description,
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

  const remoteAccessOptions = useMemo(
    () => filterByTagKeywords(compatibleComponents, ['license', 'remote', 'idrac', 'ilo']),
    [compatibleComponents]
  )
  const railOptions = useMemo(() => filterByTagKeywords(compatibleComponents, ['rail']), [compatibleComponents])
  const bezelOptions = useMemo(() => filterByTagKeywords(compatibleComponents, ['bezel']), [compatibleComponents])

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

  const chassisOptions = useMemo(() => {
    return compatibleComponents
      .filter((component) => component.tags.some((tag) => tag.toLowerCase().includes('chassis')))
      .sort((a, b) => a.model.localeCompare(b.model))
  }, [compatibleComponents])

  const getSelections = (type: string) => selectedComponents[type] || []

  const getSelectedIds = (type: string) => getSelections(type).map((selection) => selection.componentId)

  const getFirstSelection = (type: string) => getSelections(type)[0]

  const getSelectedComponent = (type: string) => {
    const selection = getFirstSelection(type)
    if (!selection?.componentId) return null
    return componentLookup.get(selection.componentId) || null
  }

  const getSelectedQtyTotal = (type: string) => {
    return getSelections(type).reduce((total, selection) => {
      const qty = Number(selection.qty || 0)
      return Number.isFinite(qty) ? total + qty : total
    }, 0)
  }

  const getTagNumber = (tags: string[], prefixes: string[]) => {
    for (const tagRaw of tags) {
      const tag = tagRaw.toLowerCase()
      for (const prefix of prefixes) {
        if (!tag.startsWith(prefix)) continue
        const value = parseFloat(tag.slice(prefix.length).replace(/[^0-9.]/g, ''))
        if (Number.isFinite(value)) return value
      }
    }
    return null
  }

  const getCapacityGbFromTags = (tags: string[]) => {
    const tb = getTagNumber(tags, ['tb_', 'tib_', 'capacity_tb_', 'size_tb_'])
    if (tb != null) return tb * 1000
    const gb = getTagNumber(tags, ['gb_', 'gib_', 'capacity_gb_', 'size_gb_'])
    if (gb != null) return gb
    return null
  }

  const formatCapacity = (gb: number) => {
    if (gb >= 1000) {
      const tb = gb / 1000
      const label = tb % 1 === 0 ? tb.toFixed(0) : tb.toFixed(2)
      return `${label} TB`
    }
    return `${Math.round(gb)} GB`
  }

  const getMaxForType = (type: string) => {
    if (!selectedModel) return null
    const tags = selectedModel.tags
    const prefixesByType: Record<string, string[]> = {
      cpu: ['max_cpu_', 'max_cpus_', 'cpu_max_', 'cpu_slots_'],
      memory: ['max_dimm_', 'max_dimms_', 'memory_slots_', 'max_memory_slots_', 'dimm_slots_'],
      drive: ['max_drive_', 'max_drives_', 'drive_bays_', 'bays_', 'bay_'],
      gpu: ['max_gpu_', 'max_gpus_', 'gpu_slots_'],
      nic: ['max_nic_', 'max_nics_', 'nic_slots_'],
      power: ['max_psu_', 'max_psus_', 'psu_slots_'],
    }
    const prefixes = prefixesByType[type]
    if (!prefixes) return null
    return getTagNumber(tags, prefixes)
  }

  const getInStockOptions = (options: ComponentModel[]) => {
    return options.filter((component) => {
      if (!component.part_number) return false
      const qty = getStockQty(component.part_number)
      return typeof qty === 'number' && qty > 0
    })
  }

  function filterByTagKeywords(options: ComponentModel[], keywords: string[]) {
    const lowered = keywords.map((keyword) => keyword.toLowerCase())
    return options.filter((component) => {
      const tags = component.tags.map((tag) => tag.toLowerCase())
      return lowered.some((keyword) => tags.some((tag) => tag.includes(keyword)))
    })
  }

  const getSelectionValueForOptions = (options: ComponentModel[], selectedId: string) => {
    if (!selectedId) return ''
    return options.some((option) => option.id === selectedId) ? selectedId : ''
  }

  const getSelectionValuesForOptions = (options: ComponentModel[], selectedIds: string[]) => {
    if (!selectedIds.length) return []
    const allowed = new Set(options.map((option) => option.id))
    return selectedIds.filter((id) => allowed.has(id))
  }

  const updateComponentSelection = (type: string, componentId: string | string[]) => {
    setSelectedComponents((prev) => {
      const next = { ...prev }
      if (multiSelectTypes.has(type)) {
        const ids = Array.isArray(componentId) ? componentId : componentId ? [componentId] : []
        const current = prev[type] || []
        const selections = ids.map((id) => current.find((entry) => entry.componentId === id) || { componentId: id, qty: '1' })
        if (!selections.length) {
          delete next[type]
          return next
        }
        next[type] = selections
        return next
      }
      const id = Array.isArray(componentId) ? componentId[0] || '' : componentId
      if (!id) {
        delete next[type]
        return next
      }
      const existing = prev[type]?.[0]
      next[type] = [{ componentId: id, qty: existing?.qty || '1' }]
      return next
    })
  }

  const updateComponentQty = (type: string, qty: string, componentId?: string) => {
    setSelectedComponents((prev) => {
      const current = prev[type] || []
      if (!current.length) return prev
      const next = { ...prev }
      if (multiSelectTypes.has(type)) {
        next[type] = current.map((selection) => {
          if (componentId && selection.componentId !== componentId) return selection
          return { ...selection, qty }
        })
        return next
      }
      next[type] = [{ ...current[0], qty }]
      return next
    })
  }

  const mergeInStockSelection = (type: string, inStockOptions: ComponentModel[], inStockIds: string[]) => {
    if (!multiSelectTypes.has(type)) {
      updateComponentSelection(type, inStockIds[0] || '')
      return
    }
    const inStockSet = new Set(inStockOptions.map((option) => option.id))
    const keepIds = getSelectedIds(type).filter((id) => !inStockSet.has(id))
    updateComponentSelection(type, [...keepIds, ...inStockIds])
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

  const handleManufacturerSelect = (value: string) => {
    setSelectedManufacturer(value)
    setSelectedFamily('')
    setSelectedModelId('')
    setSelectedChassisId('')
  }

  const handleFamilySelect = (value: string) => {
    setSelectedFamily(value)
    setSelectedModelId('')
    setSelectedChassisId('')
  }

  const handleModelSelect = (value: string) => {
    setSelectedModelId(value)
    setSelectedChassisId('')
    if (!value) return
    const match = filteredModels.find((model) => model.id === value)
    if (!match) return
    setSelectedManufacturer(match.manufacturer)
    setSelectedFamily(match.family || '')
  }

  const missingRequired = requiredTypes.filter((type) => {
    const selections = getSelections(type)
    const manual = manualOverrides[type]
    if (selections.length) return false
    if (manual?.enabled && manual.label.trim()) return false
    return true
  })

  const manualUsed = Object.values(manualOverrides).some((entry) => entry.enabled && entry.label.trim())
  const requiredChecklist = requiredTypes.map((type) => componentTypeLabels[type] || type)
  const requiredProgress = `${requiredTypes.length - missingRequired.length}/${requiredTypes.length}`

  const compatibilityText = useMemo(() => {
    if (missingRequired.length > 0) return { label: 'Missing required selections', tone: 'bad' }
    if (manualUsed) return { label: 'Manual parts added', tone: 'warn' }
    return { label: 'Ready to save', tone: 'good' }
  }, [missingRequired.length, manualUsed])

  const canSave = missingRequired.length === 0

  const summaryItems = componentOrder.flatMap((type) => {
    const selections = getSelections(type)
    if (selections.length) {
      return selections
        .map((selection) => {
          const component = componentLookup.get(selection.componentId)
          if (!component) return null
          const label = `${component.manufacturer ? `${component.manufacturer} ` : ''}${component.model}${
            component.part_number ? ` (${component.part_number})` : ''
          }`
          return { type, label, qty: selection.qty || '1', source: 'catalog' }
        })
        .filter((item): item is { type: string; label: string; qty: string; source: string } => Boolean(item))
    }
    const manual = manualOverrides[type]
    if (manual?.enabled && manual.label.trim()) {
      return [{ type, label: manual.label, qty: manual.qty || '1', source: 'manual' }]
    }
    return []
  })

  const pcieSummary = useMemo(() => {
    if (!selectedModel) return 'Auto'
    const slots = getTagNumber(selectedModel.tags, ['pcie_slots_', 'pcie_slot_'])
    const gen = getTagNumber(selectedModel.tags, ['pcie_gen_', 'pcie_gen'])
    if (slots && gen) return `${slots}x Gen${gen}`
    if (slots) return `${slots} slots`
    return 'Auto'
  }, [selectedModel])

  const isServer = machineType === 'server'
  const hasChassisOptions = chassisOptions.length > 0

  const resetConfigurator = () => {
    setConfigName('')
    setConfigQty('1')
    setSelectedManufacturer('')
    setSelectedFamily('')
    setSelectedModelId('')
    setSelectedChassisId('')
    setSelectedComponents({})
    setManualOverrides({})
    setAdvancedValues({})
    setCompatError('')
    setCompatibleComponents([])
    setStockByPart({})
    setStockLoading(false)
    setStockChecked({})
  }

  const renderComponentRow = (type: string, required: boolean) => {
    const label = componentTypeLabels[type] || type
    const options = compatibleByType[type] || []
    const hasOptions = options.length > 0
    const manual = manualOverrides[type] || { enabled: false, label: '', partNumber: '', qty: '1', notes: '' }
    const manualActive = manual.enabled
    const selections = getSelections(type)
    const selection = selections[0]
    const selectedIds = getSelectedIds(type)
    const selectedComponent = selection?.componentId ? componentLookup.get(selection.componentId) : null
    const optionItems = buildComponentOptions(options)
    const isMulti = multiSelectTypes.has(type)

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
            {isMulti ? (
              <SearchableSelect
                value={selectedIds}
                options={optionItems}
                placeholder={options.length ? 'Select option' : 'No compatible options'}
                onChange={(value) => updateComponentSelection(type, value)}
                multiple
                searchPlaceholder="Search options"
                emptyLabel="No matches"
              />
            ) : (
              <SearchableSelect
                value={selection?.componentId || ''}
                options={optionItems}
                placeholder={options.length ? 'Select option' : 'No compatible options'}
                onChange={(value) => updateComponentSelection(type, value)}
                searchPlaceholder="Search options"
                emptyLabel="No matches"
              />
            )}
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
            {isMulti ? (
              selections.length ? (
                renderSelectionStockPills(type)
              ) : (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pick options to see details.</div>
              )
            ) : selectedComponent ? (
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
              Can't find it? Add a manual part
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

  const renderSearchSelect = ({
    label,
    options,
    value,
    placeholder,
    disabled,
    note,
    onChange,
    multiple,
  }: {
    label: string
    options: ComponentModel[]
    value: string | string[]
    placeholder: string
    disabled?: boolean
    note?: string
    onChange: (value: string | string[]) => void
    multiple?: boolean
  }) => {
    const normalizedPlaceholder = placeholder.trim().toLowerCase().replace(/\.+$/, '')
    const normalizedNote = note?.trim().toLowerCase().replace(/\.+$/, '')
    const resolvedNote = normalizedNote && normalizedNote !== normalizedPlaceholder ? note : undefined
    return (
      <label className="field">
        <span className="fieldLabel">{label}</span>
        {multiple ? (
          <SearchableSelect
            value={value as string[]}
            options={buildComponentOptions(options)}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(next) => onChange(next)}
            multiple
            searchPlaceholder="Search part number or description"
            emptyLabel="No matches"
          />
        ) : (
          <SearchableSelect
            value={value as string}
            options={buildComponentOptions(options)}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(next) => onChange(next)}
            searchPlaceholder="Search part number or description"
            emptyLabel="No matches"
          />
        )}
        {resolvedNote ? <span className="fieldNote">{resolvedNote}</span> : null}
      </label>
    )
  }

  const renderSelectionStockPills = (type: string) => {
    const selections = getSelections(type)
    if (!selections.length) return null
    return (
      <div className="stockPillList">
        {selections.map((selection) => {
          const component = componentLookup.get(selection.componentId)
          if (!component) return null
          const label = `${component.manufacturer ? `${component.manufacturer} ` : ''}${component.model}`
          return (
            <div key={selection.componentId} className="stockPillItem">
              <span className="fieldNote">{label}</span>
              {renderStockPill(component.part_number, selection.qty)}
            </div>
          )
        })}
      </div>
    )
  }

  const coresNeedOptions = ['4', '8', '16', '24', '32', '48', '64']
  const memoryNeedOptions = ['32', '64', '128', '256', '512', '1024']
  const storageNeedOptions = ['2 TB', '4 TB', '8 TB', '16 TB', '32 TB', '64 TB']

  const cpuOptions = compatibleByType.cpu || []
  const memoryOptions = compatibleByType.memory || []
  const driveOptions = compatibleByType.drive || []
  const nicOptions = compatibleByType.nic || []
  const gpuOptions = compatibleByType.gpu || []
  const powerOptions = compatibleByType.power || []

  const cpuInStockOptions = getInStockOptions(cpuOptions)
  const memoryInStockOptions = getInStockOptions(memoryOptions)
  const driveInStockOptions = getInStockOptions(driveOptions)
  const nicInStockOptions = getInStockOptions(nicOptions)
  const gpuInStockOptions = getInStockOptions(gpuOptions)
  const powerInStockOptions = getInStockOptions(powerOptions)
  const railInStockOptions = getInStockOptions(railOptions)
  const bezelInStockOptions = getInStockOptions(bezelOptions)

  const selectedCpu = getSelectedComponent('cpu')
  const selectedPower = getSelectedComponent('power')
  const cpuSelection = getFirstSelection('cpu')
  const powerSelection = getFirstSelection('power')
  const memorySelections = getSelections('memory')
  const driveSelections = getSelections('drive')

  const cpuQty = getSelectedQtyTotal('cpu')

  const cpuCoresPer = selectedCpu ? getTagNumber(selectedCpu.tags, ['cores_', 'core_', 'cpu_cores_', 'corecount_']) : null
  const cpuTotalCores = cpuCoresPer != null && cpuQty > 0 ? cpuCoresPer * cpuQty : null

  const memoryTotalGb = memorySelections.reduce((total, selection) => {
    const component = componentLookup.get(selection.componentId)
    if (!component) return total
    const perGb = getTagNumber(component.tags, ['gb_', 'gib_', 'memory_gb_', 'size_gb_'])
    if (perGb == null) return total
    const qty = Number(selection.qty || 0)
    if (!Number.isFinite(qty) || qty <= 0) return total
    return total + perGb * qty
  }, 0)
  const memoryTotalKnown = memorySelections.some((selection) => {
    const component = componentLookup.get(selection.componentId)
    if (!component) return false
    return getTagNumber(component.tags, ['gb_', 'gib_', 'memory_gb_', 'size_gb_']) != null
  })

  const driveTotalGb = driveSelections.reduce((total, selection) => {
    const component = componentLookup.get(selection.componentId)
    if (!component) return total
    const perGb = getCapacityGbFromTags(component.tags)
    if (perGb == null) return total
    const qty = Number(selection.qty || 0)
    if (!Number.isFinite(qty) || qty <= 0) return total
    return total + perGb * qty
  }, 0)
  const driveTotalKnown = driveSelections.some((selection) => {
    const component = componentLookup.get(selection.componentId)
    if (!component) return false
    return getCapacityGbFromTags(component.tags) != null
  })

  const cpuMax = getMaxForType('cpu')
  const memoryMax = getMaxForType('memory')
  const driveMax = getMaxForType('drive')
  const powerMax = getMaxForType('power')

  const cpuSelectedId = getSelectedIds('cpu')[0] || ''
  const memorySelectedIds = getSelectedIds('memory')
  const driveSelectedIds = getSelectedIds('drive')
  const nicSelectedId = getSelectedIds('nic')[0] || ''
  const gpuSelectedId = getSelectedIds('gpu')[0] || ''
  const powerSelectedId = getSelectedIds('power')[0] || ''
  const railSelectedId = getSelectedIds('rail')[0] || ''
  const bezelSelectedId = getSelectedIds('bezel')[0] || ''
  const remoteSelectedId = getSelectedIds('remote_access')[0] || ''

  const cpuStockValue = getSelectionValueForOptions(cpuInStockOptions, cpuSelectedId)
  const memoryStockValue = getSelectionValuesForOptions(memoryInStockOptions, memorySelectedIds)
  const driveStockValue = getSelectionValuesForOptions(driveInStockOptions, driveSelectedIds)
  const nicStockValue = getSelectionValueForOptions(nicInStockOptions, nicSelectedId)
  const gpuStockValue = getSelectionValueForOptions(gpuInStockOptions, gpuSelectedId)
  const powerStockValue = getSelectionValueForOptions(powerInStockOptions, powerSelectedId)
  const railStockValue = getSelectionValueForOptions(railInStockOptions, railSelectedId)
  const bezelStockValue = getSelectionValueForOptions(bezelInStockOptions, bezelSelectedId)

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
              <SearchableSelect
                value={machineType}
                options={machineOptions.map((option) => ({ value: option.value, label: option.label, searchText: option.label }))}
                placeholder="Select machine type"
                onChange={(value) => setMachineType(value as MachineType)}
                searchPlaceholder="Search machine types"
                emptyLabel="No matches"
              />
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
                    <span className="fieldLabel">Manufacturer</span>
                    <SearchableSelect
                      value={selectedManufacturer}
                      onChange={handleManufacturerSelect}
                      disabled={catalogLoading || manufacturerOptions.length === 0}
                      options={manufacturerOptions.map((maker) => ({ value: maker, label: maker, searchText: maker }))}
                      placeholder={manufacturerOptions.length ? 'Select manufacturer' : 'No manufacturers'}
                      searchPlaceholder="Search manufacturers"
                      emptyLabel="No matches"
                    />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Product family</span>
                    <SearchableSelect
                      value={selectedFamily}
                      onChange={handleFamilySelect}
                      disabled={!selectedManufacturer || familyOptions.length === 0}
                      options={familyOptions.map((family) => ({ value: family, label: family, searchText: family }))}
                      placeholder={familyOptions.length ? 'Select family' : 'No families'}
                      searchPlaceholder="Search families"
                      emptyLabel="No matches"
                    />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Model</span>
                    <SearchableSelect
                      value={selectedModelId}
                      onChange={handleModelSelect}
                      disabled={!selectedManufacturer || modelOptions.length === 0}
                      options={modelOptions.map((model) => ({
                        value: model.id,
                        label: formatPlatformLabel(model),
                        searchText: `${model.manufacturer} ${model.family || ''} ${model.model} ${model.form_factor || ''} ${model.tags.join(' ')}`,
                      }))}
                      placeholder={modelOptions.length ? 'Select model' : 'No models'}
                      searchPlaceholder="Search models"
                      emptyLabel="No matches"
                    />
                  </label>
                </div>

                <div className="configFieldGrid">
                  <label className="field">
                    <span className="fieldLabel">Form factor</span>
                    <input readOnly value={selectedModel?.form_factor || 'Auto'} style={{ ...controlStyle, opacity: 0.7 }} />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Chassis model</span>
                    {hasChassisOptions ? (
                      <SearchableSelect
                        value={selectedChassisId}
                        onChange={(value) => setSelectedChassisId(value)}
                        disabled={!selectedModelId || chassisOptions.length === 0}
                        options={buildComponentOptions(chassisOptions)}
                        placeholder={chassisOptions.length ? 'Select chassis' : 'No chassis options'}
                        searchPlaceholder="Search chassis models"
                        emptyLabel="No matches"
                      />
                    ) : (
                      <input
                        readOnly
                        value={selectedModel ? selectedModel.model : 'Auto'}
                        style={{ ...controlStyle, opacity: 0.7 }}
                      />
                    )}
                  </label>
                  <label className="field">
                    <span className="fieldLabel">PCIe slots</span>
                    <input readOnly value={pcieSummary} style={{ ...controlStyle, opacity: 0.7 }} />
                  </label>
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

            {isServer ? (
              <>
                {compatLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading compatibility...</div> : null}
                {compatError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{compatError}</div> : null}

                <details className="accordion" open>
                  <summary>CPU</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible CPUs in stock',
                        options: cpuInStockOptions,
                        value: cpuStockValue,
                        placeholder: cpuInStockOptions.length ? 'Select in-stock CPU' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !cpuInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        onChange: (value) => updateComponentSelection('cpu', value),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible CPUs',
                        options: cpuOptions,
                        value: cpuSelectedId,
                        placeholder: cpuOptions.length ? 'Select compatible CPU' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !cpuOptions.length ? 'No compatible options yet.' : undefined,
                        onChange: (value) => updateComponentSelection('cpu', value),
                      })}
                    </div>
                    <div className="configFieldGrid">
                      <label className="field">
                        <span className="fieldLabel">{selectedCpu ? 'Cores' : 'How many cores do you need?'}</span>
                        {selectedCpu ? (
                          <input
                            readOnly
                            value={cpuTotalCores != null ? `${cpuTotalCores} cores` : 'Auto'}
                            style={{ ...controlStyle, opacity: 0.7 }}
                          />
                        ) : (
                          <SearchableSelect
                            value={advancedValues.cpu_cores_need || ''}
                            onChange={(value) => setAdvancedValues((prev) => ({ ...prev, cpu_cores_need: value }))}
                            options={coresNeedOptions.map((opt) => ({
                              value: opt,
                              label: `${opt} cores`,
                              searchText: `${opt} cores`,
                            }))}
                            placeholder="Select cores"
                            searchPlaceholder="Search cores"
                            emptyLabel="No matches"
                          />
                        )}
                      </label>
                      <label className="field">
                        <span className="fieldLabel">Quantity</span>
                        <input
                          type="number"
                          min={0}
                          max={cpuMax ?? undefined}
                          value={cpuSelection?.qty || ''}
                          onChange={(e) => updateComponentQty('cpu', e.target.value)}
                          placeholder="0"
                          style={{ ...controlStyle, padding: '8px 10px' }}
                        />
                        <span className="fieldNote">Max: {cpuMax ?? 'Auto'}</span>
                      </label>
                    </div>
                    {selectedCpu ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {renderStockPill(selectedCpu.part_number, cpuSelection?.qty || '')}
                      </div>
                    ) : null}
                  </div>
                </details>

                <details className="accordion" open>
                  <summary>Memory</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible DIMMs in stock',
                        options: memoryInStockOptions,
                        value: memoryStockValue,
                        placeholder: memoryInStockOptions.length ? 'Select in-stock DIMM' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !memoryInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        multiple: true,
                        onChange: (value) => mergeInStockSelection('memory', memoryInStockOptions, value as string[]),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible DIMMs',
                        options: memoryOptions,
                        value: memorySelectedIds,
                        placeholder: memoryOptions.length ? 'Select compatible DIMM' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !memoryOptions.length ? 'No compatible options yet.' : undefined,
                        multiple: true,
                        onChange: (value) => updateComponentSelection('memory', value),
                      })}
                    </div>
                    <div className="configFieldGrid">
                      <label className="field">
                        <span className="fieldLabel">
                          {memorySelections.length ? 'Gigabytes' : 'How many Gigabytes of memory do you need?'}
                        </span>
                        {memorySelections.length ? (
                          <input
                            readOnly
                            value={memoryTotalKnown ? `${Math.round(memoryTotalGb)} GB` : 'Auto'}
                            style={{ ...controlStyle, opacity: 0.7 }}
                          />
                        ) : (
                          <SearchableSelect
                            value={advancedValues.memory_gb_need || ''}
                            onChange={(value) => setAdvancedValues((prev) => ({ ...prev, memory_gb_need: value }))}
                            options={memoryNeedOptions.map((opt) => ({
                              value: opt,
                              label: `${opt} GB`,
                              searchText: `${opt} GB`,
                            }))}
                            placeholder="Select memory size"
                            searchPlaceholder="Search memory size"
                            emptyLabel="No matches"
                          />
                        )}
                      </label>
                      <label className="field">
                        <span className="fieldLabel">Quantity</span>
                        <input
                          type="number"
                          min={0}
                          max={memoryMax ?? undefined}
                          value={memorySelections[0]?.qty || ''}
                          onChange={(e) => updateComponentQty('memory', e.target.value)}
                          placeholder="0"
                          style={{ ...controlStyle, padding: '8px 10px' }}
                        />
                        <span className="fieldNote">Max: {memoryMax ?? 'Auto'}</span>
                      </label>
                    </div>
                    {renderSelectionStockPills('memory')}
                  </div>
                </details>

                <details className="accordion" open>
                  <summary>Storage Controller</summary>
                  <div className="accordionBody">
                    <label className="field">
                      <span className="fieldLabel">Controller type</span>
                      <SearchableSelect
                        value={advancedValues.storage_controller_type || ''}
                        onChange={(value) => setAdvancedValues((prev) => ({ ...prev, storage_controller_type: value }))}
                        options={[
                          { value: 'pcie', label: 'PCIe cards', searchText: 'pcie cards' },
                          { value: 'front', label: 'Front cards', searchText: 'front cards' },
                          { value: 'onboard', label: 'Onboard', searchText: 'onboard' },
                          { value: 'diskless', label: 'Diskless', searchText: 'diskless' },
                        ]}
                        placeholder="Select controller type"
                        searchPlaceholder="Search controller types"
                        emptyLabel="No matches"
                      />
                    </label>
                  </div>
                </details>

                <details className="accordion" open>
                  <summary>Storage</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible drives in stock',
                        options: driveInStockOptions,
                        value: driveStockValue,
                        placeholder: driveInStockOptions.length ? 'Select in-stock drive' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !driveInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        multiple: true,
                        onChange: (value) => mergeInStockSelection('drive', driveInStockOptions, value as string[]),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible drives',
                        options: driveOptions,
                        value: driveSelectedIds,
                        placeholder: driveOptions.length ? 'Select compatible drive' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !driveOptions.length ? 'No compatible options yet.' : undefined,
                        multiple: true,
                        onChange: (value) => updateComponentSelection('drive', value),
                      })}
                    </div>
                    <div className="configFieldGrid">
                      <label className="field">
                        <span className="fieldLabel">
                          {driveSelections.length ? 'Usable storage' : 'How much Usable storage do you need?'}
                        </span>
                        {driveSelections.length ? (
                          <input
                            readOnly
                            value={driveTotalKnown ? formatCapacity(driveTotalGb) : 'Auto'}
                            style={{ ...controlStyle, opacity: 0.7 }}
                          />
                        ) : (
                          <SearchableSelect
                            value={advancedValues.storage_usable_need || ''}
                            onChange={(value) => setAdvancedValues((prev) => ({ ...prev, storage_usable_need: value }))}
                            options={storageNeedOptions.map((opt) => ({
                              value: opt,
                              label: opt,
                              searchText: opt,
                            }))}
                            placeholder="Select usable storage"
                            searchPlaceholder="Search storage targets"
                            emptyLabel="No matches"
                          />
                        )}
                      </label>
                      <label className="field">
                        <span className="fieldLabel">Quantity</span>
                        <input
                          type="number"
                          min={0}
                          max={driveMax ?? undefined}
                          value={driveSelections[0]?.qty || ''}
                          onChange={(e) => updateComponentQty('drive', e.target.value)}
                          placeholder="0"
                          style={{ ...controlStyle, padding: '8px 10px' }}
                        />
                        <span className="fieldNote">Max: {driveMax ?? 'Auto'}</span>
                      </label>
                    </div>
                    {renderSelectionStockPills('drive')}
                  </div>
                </details>

                <details className="accordion">
                  <summary>Network card</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible network cards in stock',
                        options: nicInStockOptions,
                        value: nicStockValue,
                        placeholder: nicInStockOptions.length ? 'Select in-stock NIC' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !nicInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        onChange: (value) => updateComponentSelection('nic', value),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible network cards',
                        options: nicOptions,
                        value: nicSelectedId,
                        placeholder: nicOptions.length ? 'Select compatible NIC' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !nicOptions.length ? 'No compatible options yet.' : undefined,
                        onChange: (value) => updateComponentSelection('nic', value),
                      })}
                    </div>
                  </div>
                </details>

                <details className="accordion">
                  <summary>GPU</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible GPUs in stock',
                        options: gpuInStockOptions,
                        value: gpuStockValue,
                        placeholder: gpuInStockOptions.length ? 'Select in-stock GPU' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !gpuInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        onChange: (value) => updateComponentSelection('gpu', value),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible GPUs',
                        options: gpuOptions,
                        value: gpuSelectedId,
                        placeholder: gpuOptions.length ? 'Select compatible GPU' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !gpuOptions.length ? 'No compatible options yet.' : undefined,
                        onChange: (value) => updateComponentSelection('gpu', value),
                      })}
                    </div>
                  </div>
                </details>

                <details className="accordion">
                  <summary>Power Supplies</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible power supplies in stock',
                        options: powerInStockOptions,
                        value: powerStockValue,
                        placeholder: powerInStockOptions.length ? 'Select in-stock PSU' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !powerInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        onChange: (value) => updateComponentSelection('power', value),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible power supplies',
                        options: powerOptions,
                        value: powerSelectedId,
                        placeholder: powerOptions.length ? 'Select compatible PSU' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !powerOptions.length ? 'No compatible options yet.' : undefined,
                        onChange: (value) => updateComponentSelection('power', value),
                      })}
                    </div>
                    <div className="configFieldGrid">
                      <label className="field">
                        <span className="fieldLabel">Quantity</span>
                        <input
                          type="number"
                          min={0}
                          max={powerMax ?? undefined}
                          value={powerSelection?.qty || ''}
                          onChange={(e) => updateComponentQty('power', e.target.value)}
                          placeholder="0"
                          style={{ ...controlStyle, padding: '8px 10px' }}
                        />
                        <span className="fieldNote">Max: {powerMax ?? 'Auto'}</span>
                      </label>
                    </div>
                    {selectedPower ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {renderStockPill(selectedPower.part_number, powerSelection?.qty || '')}
                      </div>
                    ) : null}
                  </div>
                </details>

                <details className="accordion">
                  <summary>Remote Access</summary>
                  <div className="accordionBody">
                    {renderSearchSelect({
                      label: 'All compatible licenses',
                      options: remoteAccessOptions,
                      value: remoteSelectedId,
                      placeholder: remoteAccessOptions.length ? 'Select compatible license' : 'No compatible licenses',
                      disabled: !selectedModelId || compatLoading,
                      note: !remoteAccessOptions.length ? 'No compatible licenses yet.' : undefined,
                      onChange: (value) => updateComponentSelection('remote_access', value),
                    })}
                  </div>
                </details>

                <details className="accordion">
                  <summary>Rail kit</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible rail kits in stock',
                        options: railInStockOptions,
                        value: railStockValue,
                        placeholder: railInStockOptions.length ? 'Select in-stock rail kit' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !railInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        onChange: (value) => updateComponentSelection('rail', value),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible rail kits',
                        options: railOptions,
                        value: railSelectedId,
                        placeholder: railOptions.length ? 'Select compatible rail kit' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !railOptions.length ? 'No compatible options yet.' : undefined,
                        onChange: (value) => updateComponentSelection('rail', value),
                      })}
                    </div>
                  </div>
                </details>

                <details className="accordion">
                  <summary>Bezel</summary>
                  <div className="accordionBody">
                    <div className="configFieldGrid">
                      {renderSearchSelect({
                        label: 'Compatible bezels in stock',
                        options: bezelInStockOptions,
                        value: bezelStockValue,
                        placeholder: bezelInStockOptions.length ? 'Select in-stock bezel' : 'No in-stock options',
                        disabled: !selectedModelId || compatLoading,
                        note: !bezelInStockOptions.length ? (stockLoading ? 'Loading stock data.' : 'No in-stock options.') : undefined,
                        onChange: (value) => updateComponentSelection('bezel', value),
                      })}
                      {renderSearchSelect({
                        label: 'All compatible bezels',
                        options: bezelOptions,
                        value: bezelSelectedId,
                        placeholder: bezelOptions.length ? 'Select compatible bezel' : 'No compatible options',
                        disabled: !selectedModelId || compatLoading,
                        note: !bezelOptions.length ? 'No compatible options yet.' : undefined,
                        onChange: (value) => updateComponentSelection('bezel', value),
                      })}
                    </div>
                  </div>
                </details>
              </>
            ) : (
              <>
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
              </>
            )}

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
                          <SearchableSelect
                            value={value}
                            onChange={(next) => setAdvancedValues((prev) => ({ ...prev, [field.key]: next }))}
                            options={(field.options || []).map((opt) => ({ value: opt, label: opt, searchText: opt }))}
                            placeholder="Select"
                            searchPlaceholder="Search options"
                            emptyLabel="No matches"
                          />
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
                <span className="summaryCheck">OK</span>
                <span>
                  Configuration: <strong>{configName.trim() || 'Untitled configuration'}</strong>
                </span>
              </div>
              <div className="summaryItem">
                <span className="summaryCheck">OK</span>
                <span>
                  Machine Type: <strong>{machineOptions.find((opt) => opt.value === machineType)?.label || 'Unknown'}</strong>
                </span>
              </div>
              <div className="summaryItem">
                <span className="summaryCheck">OK</span>
                <span>
                  Quantity: <strong>{configQty || '1'}</strong>
                </span>
              </div>
              <div className="summaryItem">
                <span className="summaryCheck">OK</span>
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
        .selectWrap {
          position: relative;
        }
        .selectTrigger {
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 0 12px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          color: var(--text);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
          transition: box-shadow 0.14s ease, border-color 0.14s ease;
        }
        .selectTrigger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .selectTrigger:focus-visible {
          outline: none;
        }
        .selectTriggerOpen {
          border-color: var(--accent);
          box-shadow: 0 0 0 4px rgba(90, 180, 255, 0.16);
        }
        .selectValue {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .selectPlaceholder {
          color: var(--muted);
        }
        .selectChevron {
          width: 18px;
          height: 18px;
          opacity: 0.7;
          flex: 0 0 auto;
          transition: transform 0.14s ease;
        }
        .selectChevronOpen {
          transform: rotate(180deg);
        }
        .selectMenu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 14px;
          display: grid;
          gap: 0;
          z-index: 20;
          padding: 10px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.14);
        }
        .selectSearchWrap {
          padding: 8px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .selectSearchIcon {
          width: 16px;
          height: 16px;
          opacity: 0.6;
          flex: 0 0 auto;
        }
        .selectSearch {
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text);
          font-size: 14px;
        }
        .selectList {
          list-style: none;
          margin: 10px 0 0;
          padding: 0;
          max-height: 240px;
          overflow: auto;
          border-radius: 12px;
        }
        .selectOption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          text-align: left;
          padding: 10px 10px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          font-size: 14px;
        }
        .selectOptionLabel {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .selectOptionFocused {
          background: var(--panel-2);
        }
        .selectOptionSelected {
          font-weight: 700;
        }
        .selectOptionMuted {
          color: var(--text);
          opacity: 0.92;
        }
        .selectCheckbox {
          width: 16px;
          height: 16px;
          accent-color: var(--accent);
        }
        .selectCheck {
          width: 18px;
          height: 18px;
          opacity: 0.85;
          flex: 0 0 auto;
        }
        .selectOption:hover {
          background: var(--panel-2);
        }
        .selectOptionDisabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .selectEmpty {
          padding: 12px 10px;
          color: var(--muted);
          font-size: 13px;
        }
        .selectFooter {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }
        .selectFooterBtn {
          width: 100%;
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--panel-2);
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .selectFooterBtn:hover {
          background: var(--panel);
        }
        .fieldNote {
          font-size: 11px;
          color: var(--muted);
        }
        .stockPillList {
          display: grid;
          gap: 6px;
        }
        .stockPillItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
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
          overflow: visible;
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
          content: 'v';
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




