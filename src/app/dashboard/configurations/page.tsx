'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type FieldKind = 'text' | 'number' | 'select' | 'toggle' | 'readonly' | 'textarea'

type Field = {
  key: string
  label: string
  kind: FieldKind
  options?: string[]
  placeholder?: string
  help?: string
  readOnlyValue?: string
}

type Section = {
  title: string
  description?: string
  fields: Field[]
}

type MachineConfig = {
  label: string
  sections: Section[]
}

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

const yesNo = ['Yes', 'No']

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

const serverConfig: MachineConfig = {
  label: 'Server',
  sections: [
    {
      title: 'Chassis Model',
      description: 'Defines physical form factor and expansion limits.',
      fields: [
        { key: 'server_manufacturer', label: 'Manufacturer', kind: 'select', options: ['Dell', 'HPE', 'Lenovo', 'Cisco', 'Other'] },
        { key: 'server_model', label: 'Model', kind: 'text', placeholder: 'e.g. R740' },
        { key: 'server_form_factor', label: 'Form factor', kind: 'select', options: ['Rack', 'Tower'] },
        { key: 'server_rack_units', label: 'Rack units', kind: 'select', options: ['1U', '2U', '4U'] },
        { key: 'server_bays_25', label: '2.5 inch bays', kind: 'number', placeholder: '0' },
        { key: 'server_bays_35', label: '3.5 inch bays', kind: 'number', placeholder: '0' },
        { key: 'server_max_cpus', label: 'Max CPUs supported', kind: 'number', placeholder: '2' },
        { key: 'server_max_memory', label: 'Max memory capacity', kind: 'text', placeholder: 'e.g. 3TB' },
        { key: 'server_cpu_families', label: 'Supported CPU families', kind: 'text', placeholder: 'e.g. Xeon Scalable' },
        { key: 'server_storage_types', label: 'Supported storage types', kind: 'text', placeholder: 'SATA, SAS, NVMe' },
        { key: 'server_pcie_slots', label: 'PCIe slots (count/gen)', kind: 'text', placeholder: 'e.g. 6 x Gen3' },
      ],
    },
    {
      title: 'Processors',
      description: 'Compute capability and socket usage.',
      fields: [
        { key: 'cpu_vendor', label: 'CPU manufacturer', kind: 'select', options: ['Intel', 'AMD'] },
        { key: 'cpu_family', label: 'CPU family', kind: 'text', placeholder: 'e.g. Xeon' },
        { key: 'cpu_model', label: 'CPU model', kind: 'text', placeholder: 'e.g. 6244' },
        { key: 'cpu_count', label: 'Number of CPUs', kind: 'select', options: ['1', '2'] },
        { key: 'cpu_cores', label: 'Cores per CPU', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'cpu_freq', label: 'Base / Boost (GHz)', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'cpu_tdp', label: 'TDP', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'cpu_socket', label: 'Socket type', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Memory',
      description: 'RAM configuration and performance.',
      fields: [
        { key: 'mem_type', label: 'Memory type', kind: 'select', options: ['DDR4', 'DDR5'] },
        { key: 'mem_dimm_size', label: 'DIMM size', kind: 'select', options: ['16GB', '32GB', '64GB', '128GB'] },
        { key: 'mem_dimms', label: 'Number of DIMMs', kind: 'number', placeholder: '0' },
        { key: 'mem_total', label: 'Total memory', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'mem_speed', label: 'Speed (MHz)', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'mem_rank', label: 'Rank (optional)', kind: 'select', options: ['Single', 'Dual', 'Quad'] },
        { key: 'mem_ecc', label: 'ECC', kind: 'readonly', readOnlyValue: 'Yes' },
      ],
    },
    {
      title: 'Storage Controller',
      description: 'RAID / HBA capability.',
      fields: [
        { key: 'ctrl_type', label: 'Controller type', kind: 'select', options: ['Software RAID', 'Hardware RAID', 'HBA'] },
        { key: 'ctrl_model', label: 'Controller model', kind: 'text', placeholder: 'e.g. H740' },
        { key: 'ctrl_raid_levels', label: 'RAID levels', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'ctrl_cache', label: 'Cache size', kind: 'text', placeholder: 'e.g. 2GB' },
        { key: 'ctrl_cache_protect', label: 'Cache protection', kind: 'select', options: ['Battery', 'SuperCap', 'None'] },
        { key: 'ctrl_interface', label: 'Interface', kind: 'select', options: ['SATA', 'SAS', 'NVMe'] },
      ],
    },
    {
      title: 'Hard Drives',
      description: 'Drive mix and RAID.',
      fields: [
        { key: 'drive_type', label: 'Drive type', kind: 'select', options: ['SATA HDD', 'SATA SSD', 'SAS HDD', 'SAS SSD', 'NVMe SSD'] },
        { key: 'drive_size', label: 'Drive size', kind: 'text', placeholder: 'e.g. 3.84TB' },
        { key: 'drive_speed', label: 'Drive speed (RPM)', kind: 'text', placeholder: 'HDD only' },
        { key: 'drive_count', label: 'Drive count', kind: 'number', placeholder: '0' },
        { key: 'drive_hotplug', label: 'Hot-plug', kind: 'select', options: yesNo },
        { key: 'drive_raid', label: 'RAID config', kind: 'select', options: ['RAID 0', 'RAID 1', 'RAID 5', 'RAID 6', 'RAID 10'] },
        { key: 'drive_usable', label: 'Usable capacity', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Boot (BOSS / OS)',
      fields: [
        { key: 'boss_included', label: 'BOSS included', kind: 'select', options: yesNo },
        { key: 'boss_model', label: 'BOSS model', kind: 'text', placeholder: 'Optional' },
        { key: 'boss_drive_type', label: 'Drive type', kind: 'select', options: ['M.2 SATA', 'M.2 NVMe'] },
        { key: 'boss_drive_size', label: 'Drive size', kind: 'text', placeholder: 'e.g. 480GB' },
        { key: 'boss_raid', label: 'BOSS RAID', kind: 'select', options: ['None', 'RAID 1'] },
      ],
    },
    {
      title: 'Graphics Cards',
      fields: [
        { key: 'gpu_vendor', label: 'GPU manufacturer', kind: 'select', options: ['NVIDIA', 'AMD', 'Other'] },
        { key: 'gpu_model', label: 'GPU model', kind: 'text', placeholder: 'e.g. A4000' },
        { key: 'gpu_mem', label: 'GPU memory', kind: 'text', placeholder: 'e.g. 16GB' },
        { key: 'gpu_count', label: 'GPU count', kind: 'number', placeholder: '0' },
        { key: 'gpu_form', label: 'GPU form factor', kind: 'select', options: ['Full height', 'Low profile'] },
        { key: 'gpu_power', label: 'Power per GPU', kind: 'text', placeholder: 'e.g. 250W' },
      ],
    },
    {
      title: 'Network Card',
      fields: [
        { key: 'nic_integrated', label: 'Integrated NIC', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'nic_addon', label: 'Add-on NIC', kind: 'select', options: yesNo },
        { key: 'nic_type', label: 'NIC speed', kind: 'select', options: ['1GbE', '10GbE', '25GbE', '40GbE', '100GbE'] },
        { key: 'nic_ports', label: 'Port count', kind: 'number', placeholder: '2' },
        { key: 'nic_media', label: 'Media type', kind: 'select', options: ['RJ45', 'SFP+', 'SFP28', 'QSFP28'] },
        { key: 'nic_pcie', label: 'PCIe slot required', kind: 'select', options: yesNo },
      ],
    },
    {
      title: 'Power Supplies',
      fields: [
        { key: 'psu_watt', label: 'PSU wattage', kind: 'select', options: ['750W', '1100W', '1600W'] },
        { key: 'psu_count', label: 'PSU count', kind: 'select', options: ['1', '2'] },
        { key: 'psu_redundancy', label: 'Redundancy', kind: 'select', options: ['N', 'N+1'] },
        { key: 'psu_eff', label: 'Efficiency rating', kind: 'select', options: ['Platinum', 'Titanium'] },
      ],
    },
    {
      title: 'Remote Access',
      fields: [
        { key: 'remote_included', label: 'Remote management included', kind: 'select', options: yesNo },
        { key: 'remote_license', label: 'License level', kind: 'select', options: ['Basic', 'Enterprise'] },
        { key: 'remote_features', label: 'Features enabled', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Security',
      fields: [
        { key: 'tpm_included', label: 'TPM included', kind: 'select', options: yesNo },
        { key: 'tpm_version', label: 'TPM version', kind: 'readonly', readOnlyValue: '2.0' },
      ],
    },
    {
      title: 'Rail Kit / Bezel',
      fields: [
        { key: 'rail_type', label: 'Rail type', kind: 'select', options: ['Static', 'Sliding'] },
        { key: 'rail_included', label: 'Rails included', kind: 'select', options: yesNo },
        { key: 'bezel_included', label: 'Bezel included', kind: 'select', options: yesNo },
        { key: 'bezel_type', label: 'Bezel type', kind: 'select', options: ['Standard', 'Locking'] },
      ],
    },
    {
      title: 'Summary (Auto)',
      fields: [
        { key: 'sum_power', label: 'Estimated power draw', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'sum_storage', label: 'Usable storage', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'sum_memory', label: 'Total memory', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
  ],
}

const storageConfig: MachineConfig = {
  label: 'Storage',
  sections: [
    {
      title: 'Storage Platform',
      fields: [
        { key: 'storage_oem', label: 'OEM / Vendor', kind: 'select', options: ['Dell', 'HPE', 'NetApp', 'IBM', 'Other'] },
        { key: 'storage_family', label: 'Product family', kind: 'text', placeholder: 'e.g. Unity' },
        { key: 'storage_model', label: 'Platform model', kind: 'text', placeholder: 'e.g. 380F' },
        { key: 'storage_type', label: 'Array type', kind: 'select', options: ['Block (SAN)', 'File (NAS)', 'Unified', 'Object'] },
        { key: 'storage_deploy', label: 'Deployment', kind: 'select', options: ['All-Flash', 'Hybrid', 'HDD'] },
        { key: 'storage_form', label: 'Form factor', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'storage_scale', label: 'Max scale', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Base Enclosure',
      fields: [
        { key: 'base_type', label: 'Base enclosure type', kind: 'text', placeholder: 'Controller enclosure' },
        { key: 'base_bay_type', label: 'Drive bay type', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'base_bay_count', label: 'Base bay count', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'base_midplane', label: 'Midplane type', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'base_exp_ports', label: 'Expansion ports', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Controller Configuration',
      fields: [
        { key: 'ctrl_count', label: 'Controller count', kind: 'select', options: ['1', '2', 'Cluster'] },
        { key: 'ctrl_mode', label: 'Controller mode', kind: 'select', options: ['Active/Active', 'Active/Passive', 'Scale-out'] },
        { key: 'ctrl_cpu', label: 'Controller CPU', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'ctrl_mem', label: 'Controller memory', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Cache & Data Services',
      fields: [
        { key: 'cache_type', label: 'Cache type', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'cache_size', label: 'Cache size', kind: 'text', placeholder: 'e.g. 64GB' },
        { key: 'cache_protect', label: 'Cache protection', kind: 'select', options: ['Battery', 'SuperCap'] },
        { key: 'cache_read', label: 'Read cache', kind: 'select', options: yesNo },
        { key: 'cache_write', label: 'Write cache', kind: 'select', options: yesNo },
      ],
    },
    {
      title: 'Drive Media',
      fields: [
        { key: 'drive_iface', label: 'Drive interface', kind: 'select', options: ['SAS', 'SATA', 'NVMe'] },
        { key: 'drive_type', label: 'Drive type', kind: 'select', options: ['HDD', 'SSD', 'SCM'] },
        { key: 'drive_form', label: 'Drive form factor', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'drive_capacity', label: 'Drive capacity', kind: 'text', placeholder: 'e.g. 15.36TB' },
        { key: 'drive_speed', label: 'Drive speed', kind: 'text', placeholder: 'RPM for HDD' },
        { key: 'drive_count', label: 'Drive count', kind: 'number', placeholder: '0' },
        { key: 'drive_sed', label: 'SED', kind: 'select', options: yesNo },
        { key: 'drive_fips', label: 'FIPS', kind: 'select', options: yesNo },
      ],
    },
    {
      title: 'Protection Scheme',
      fields: [
        { key: 'prot_type', label: 'Protection type', kind: 'select', options: ['RAID', 'Erasure coding', 'Distributed parity'] },
        { key: 'prot_level', label: 'Protection level', kind: 'text', placeholder: 'e.g. dual parity' },
        { key: 'prot_spares', label: 'Hot spares / spare capacity', kind: 'text', placeholder: 'e.g. 1 or 10%' },
      ],
    },
    {
      title: 'Shelves / Expansion',
      fields: [
        { key: 'shelves_add', label: 'Add shelves', kind: 'select', options: yesNo },
        { key: 'shelf_type', label: 'Shelf type', kind: 'text', placeholder: 'SAS shelf / NVMe shelf' },
        { key: 'shelf_form', label: 'Shelf form factor', kind: 'select', options: ['2U', '4U'] },
        { key: 'shelf_bays', label: 'Bays per shelf', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'shelf_count', label: 'Number of shelves', kind: 'number', placeholder: '0' },
      ],
    },
    {
      title: 'Host Connectivity',
      fields: [
        { key: 'host_protocol', label: 'Protocol', kind: 'select', options: ['FC', 'iSCSI', 'NVMe/FC', 'NVMe/TCP', 'NFS', 'SMB'] },
        { key: 'host_speed', label: 'Port speed', kind: 'select', options: ['10GbE', '25GbE', '40GbE', '100GbE', '16G FC', '32G FC', '64G FC'] },
        { key: 'host_ports', label: 'Port count', kind: 'number', placeholder: '0' },
        { key: 'host_media', label: 'Transceiver type', kind: 'select', options: ['RJ45', 'SFP+', 'SFP28', 'QSFP28'] },
      ],
    },
    {
      title: 'Power & Support',
      fields: [
        { key: 'psu_count', label: 'PSU count', kind: 'select', options: ['1', '2'] },
        { key: 'psu_watt', label: 'PSU wattage', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'support_term', label: 'Support term', kind: 'select', options: ['1 year', '3 years', '5 years'] },
        { key: 'support_level', label: 'Support level', kind: 'select', options: ['Business hours', '24x7', '4hr replacement'] },
      ],
    },
    {
      title: 'Outputs (Auto)',
      fields: [
        { key: 'out_raw', label: 'Raw capacity', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'out_usable', label: 'Usable capacity', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'out_rack', label: 'Rack units', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
  ],
}

const networkConfig: MachineConfig = {
  label: 'Network device',
  sections: [
    {
      title: 'Platform',
      fields: [
        { key: 'net_oem', label: 'OEM / Vendor', kind: 'select', options: ['Cisco', 'Juniper', 'Arista', 'HPE', 'Other'] },
        { key: 'net_family', label: 'Product family', kind: 'text', placeholder: 'e.g. Nexus' },
        { key: 'net_model', label: 'Platform model', kind: 'text', placeholder: 'e.g. N9K' },
        { key: 'net_category', label: 'Device category', kind: 'select', options: ['Switch', 'Router', 'Firewall', 'Load balancer'] },
        { key: 'net_role', label: 'Deployment role', kind: 'select', options: ['Access', 'Aggregation', 'Core', 'Edge / WAN', 'Data Center'] },
        { key: 'net_form', label: 'Form factor', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Chassis / Architecture',
      fields: [
        { key: 'arch_type', label: 'Architecture type', kind: 'select', options: ['Fixed', 'Modular'] },
        { key: 'arch_slots', label: 'Total slots', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'arch_fabric', label: 'Switching fabric', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Performance',
      fields: [
        { key: 'perf_throughput', label: 'Max throughput', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'perf_pps', label: 'Packet rate', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'perf_latency', label: 'Latency class', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Port Configuration',
      fields: [
        { key: 'ports_fixed', label: 'Fixed port types', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'ports_count', label: 'Fixed port count', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'ports_breakout', label: 'Breakout support', kind: 'select', options: yesNo },
      ],
    },
    {
      title: 'Transceivers & Cabling',
      fields: [
        { key: 'trx_type', label: 'Transceiver type', kind: 'select', options: ['SFP', 'SFP+', 'SFP28', 'QSFP+', 'QSFP28'] },
        { key: 'trx_media', label: 'Media type', kind: 'select', options: ['Copper (DAC)', 'Fiber (SR)', 'Fiber (LR)', 'Fiber (ER)'] },
        { key: 'trx_reach', label: 'Reach', kind: 'select', options: ['1m', '3m', '10m', '100m', '10km', '40km'] },
        { key: 'trx_qty', label: 'Transceiver quantity', kind: 'number', placeholder: '0' },
        { key: 'trx_oem', label: 'OEM optics', kind: 'select', options: yesNo },
      ],
    },
    {
      title: 'Services & Protocols',
      fields: [
        { key: 'svc_layer', label: 'Layer support', kind: 'select', options: ['L2', 'L2 + L3'] },
        { key: 'svc_vlan', label: 'VLAN capacity', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'svc_routing', label: 'Routing protocols', kind: 'text', placeholder: 'OSPF, BGP, IS-IS' },
        { key: 'svc_security', label: 'Security features', kind: 'text', placeholder: 'IPS, SSL, VPN' },
      ],
    },
    {
      title: 'High Availability',
      fields: [
        { key: 'ha_mode', label: 'HA mode', kind: 'select', options: ['Standalone', 'Active/Active', 'Active/Passive', 'Stack'] },
        { key: 'ha_pair', label: 'HA pairing', kind: 'select', options: yesNo },
        { key: 'ha_stateful', label: 'Stateful failover', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Power / PoE',
      fields: [
        { key: 'psu_count', label: 'PSU count', kind: 'select', options: ['1', '2'] },
        { key: 'psu_watt', label: 'PSU wattage', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'poe', label: 'PoE support', kind: 'select', options: yesNo },
        { key: 'poe_budget', label: 'PoE budget', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
    {
      title: 'Management & Licensing',
      fields: [
        { key: 'mgmt_iface', label: 'Management interface', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'license_tier', label: 'License tier', kind: 'select', options: ['Base', 'Advanced', 'Security', 'Enterprise'] },
        { key: 'support_term', label: 'Support term', kind: 'select', options: ['1 year', '3 years', '5 years'] },
      ],
    },
    {
      title: 'Outputs (Auto)',
      fields: [
        { key: 'out_ports', label: 'Total port count', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'out_throughput', label: 'Throughput class', kind: 'readonly', readOnlyValue: 'Auto' },
        { key: 'out_rack', label: 'Rack units', kind: 'readonly', readOnlyValue: 'Auto' },
      ],
    },
  ],
}

const machineOptions = [
  { value: 'server', label: 'Server', config: serverConfig },
  { value: 'storage', label: 'Storage', config: storageConfig },
  { value: 'network', label: 'Network device', config: networkConfig },
] as const

export default function ConfigurationsPage() {
  const [machineType, setMachineType] = useState<string>('server')
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string>('')
  const [systemModels, setSystemModels] = useState<SystemModel[]>([])
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('')
  const [selectedFamily, setSelectedFamily] = useState<string>('')
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [compatibleComponents, setCompatibleComponents] = useState<ComponentModel[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState<string>('')

  const selected = useMemo(() => machineOptions.find((m) => m.value === machineType)?.config, [machineType])

  const setValue = (key: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }))
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
  }, [machineType])

  useEffect(() => {
    setSelectedFamily('')
    setSelectedModelId('')
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
        <h1 style={{ marginBottom: 6 }}>Configurations</h1>
        <div style={{ color: 'var(--muted)' }}>Configure server, storage, or network hardware. Compatibility checks and auto-calculations will be wired next.</div>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}>
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
          <div style={{ fontWeight: 900 }}>Model catalog</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
            Pick a platform to load verified compatibility rules and component dropdowns.
          </div>
        </div>
        {catalogLoading ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading catalog...</div> : null}
        {catalogError ? <div style={{ color: 'var(--bad)', fontSize: 12 }}>{catalogError}</div> : null}
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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
                const value = typeof values[fieldKey] === 'string' ? values[fieldKey] : ''
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
        </div>
      </div>

      {selected ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {selected.sections.map((section) => (
            <div
              key={section.title}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--panel)',
                display: 'grid',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>{section.title}</div>
                {section.description ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>{section.description}</div> : null}
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {section.fields.map((field) => {
                  const value = values[field.key]
                  const commonStyle = {
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                  }
                  return (
                    <label key={field.key} style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{field.label}</span>
                      {field.kind === 'select' ? (
                        <select
                          value={typeof value === 'string' ? value : ''}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          style={commonStyle}
                        >
                          <option value="">Select</option>
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.kind === 'toggle' ? (
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(e) => setValue(field.key, e.target.checked)}
                          />
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Enabled</span>
                        </label>
                      ) : field.kind === 'readonly' ? (
                        <input
                          value={field.readOnlyValue || 'Auto'}
                          readOnly
                          style={{ ...commonStyle, opacity: 0.7 }}
                        />
                      ) : field.kind === 'textarea' ? (
                        <textarea
                          value={typeof value === 'string' ? value : ''}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={3}
                          style={{ ...commonStyle, resize: 'vertical' }}
                        />
                      ) : (
                        <input
                          type={field.kind === 'number' ? 'number' : 'text'}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          style={commonStyle}
                        />
                      )}
                      {field.help ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{field.help}</span> : null}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
            color: '#fff',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Save configuration
        </button>
        <button
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            color: 'var(--text)',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Clone configuration
        </button>
        <button
          onClick={() => setValues({})}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            color: 'var(--text)',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Reset form
        </button>
      </div>
    </main>
  )
}
