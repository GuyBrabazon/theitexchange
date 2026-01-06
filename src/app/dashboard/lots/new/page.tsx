'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureProfile } from '@/lib/bootstrap'

type Seller = {
  id: string
  tenant_id: string
  name: string | null
  company: string | null
  email: string | null
  phone: string | null
}

type ParsedLine = {
  model: string | null
  description: string | null
  qty: number | null
  asking_price: number | null
  cpu?: string | null
  memory_part_numbers?: string | null
  gpu?: string | null
  specs?: Record<string, unknown> | null
}

type Buyer = {
  id: string
  tenant_id: string
  name: string
  company: string | null
  email: string | null
}

function sellerLabel(s: Seller) {
  if (s.company && s.name) return `${s.company} — ${s.name}`
  return s.company ?? s.name ?? 'Seller'
}

function toNum(v: unknown) {
  const x = Number(String(v ?? '').trim().replaceAll(',', ''))
  return Number.isFinite(x) ? x : null
}

function fmtMoney(n: number | null, currency: string) {
  if (n == null) return '—'
  const r = Math.round(Number(n) * 100) / 100
  return `${r} ${currency}`
}

function normKey(s: unknown) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]+/g, '')
}

function normalizeOemValue(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const OEM_CANONICAL: string[] = [
  '3COM',
  '3DLABS',
  '3M',
  '3RD PARTY',
  '3WARE',
  'AAEON',
  'ABBOT',
  'ABIT',
  'ABLECOM',
  'ACCELGRAPHICS',
  'ACCUTONE',
  'ACER',
  'ACME PACKET',
  'ACP',
  'ACTEL',
  'ADAPTEC',
  'ADC',
  'ADDONICS',
  'ADESSO',
  'ADIC',
  'ADOBE',
  'ADT',
  'ADTECH',
  'ADTRAN',
  'ADVA OPTICAL',
  'ADVANSYS',
  'ADVANTECH',
  'ADVENT',
  'AFC',
  'AGILENT',
  'AIRPAX',
  'ALCATEL',
  'ALERA',
  'ALIENWARE',
  'ALLIED',
  'ALPS',
  'ALT',
  'ALTEC',
  'ALTEON',
  'ALTERA',
  'ALTOS',
  'AMD',
  'AMETEK INC',
  'AMINO COMMUNICATIONS',
  'AMP',
  'AMPEX',
  'ANALOGIC',
  'ANDREW',
  'ANTEX',
  'ANYCOM',
  'AOC',
  'APC',
  'APEX',
  'APOLLO',
  'A-POWER',
  'APPLE',
  'APRICORN',
  'APROTEK',
  'APS',
  'ARCHIVE',
  'ARGUS TECHNOLOGIES',
  'ARISTA NETWORKS',
  'ARMADA',
  'ARNET',
  'ARRIS',
  'ARROW',
  'ARTEC',
  'ARUBA NETWORKS',
  'ASANTE',
  'ASCEND',
  'ASKEY',
  'ASPIRE',
  'ASTEC',
  'ASUS',
  'AT&T',
  'ATALLA',
  'ATG',
  'ATI',
  'ATMEL',
  'AU OPTRONICS',
  'AULT',
  'AVAGO',
  'AVANTEK',
  'AVAYA',
  'AVOCENT',
  'AVX',
  'AXIS',
  'AZTECH',
  'BASE',
  'BASON',
  'BATTERY BIZ',
  'BAY NETWORKS',
  'BAYTECH',
  'BELKIN',
  'BENQ',
  'BEST DATA',
  'BEST POWER',
  'BIOSTAR',
  'BLACK BOX',
  'BLACKBERRY',
  'BLINE',
  'BLONDER TONGUE LABORATORY',
  'BROADCOM',
  'BROCADE',
  'BROOKTROUT',
  'BROTHER',
  'BUFFALO',
  'BULL',
  'BUS LOGIC',
  'BUSSMAN',
  'C.ITOH AMERICA',
  'CABLE EXCHANGE',
  'CABLES TO GO',
  'CABLES UNLIMITED',
  'CABLETRON',
  'CALIX',
  'CANON',
  'CARLING',
  'CARRIER ACCESS',
  'CASCADE',
  'CASE LOGIC',
  'CASIO',
  'CATALYST',
  'CDTECH',
  'CELESTICA',
  'CENTRAL',
  'CHECKMATE',
  'CHECKPOINT',
  'CHEROKEE',
  'CHIP PC',
  'CIENA',
  'CIRRUS LOGIC',
  'CISCO',
  'CITIZEN',
  'CITRIX',
  'CLEARPOINT',
  'COBALT',
  'CODEX',
  'COMDIAL',
  'COMMANDO',
  'COMPAQ',
  'COMPELLENT',
  'COMPUFOX',
  'COMPUTER ASSOCIATES',
  'CONNER',
  'CONVERGE',
  'COOLTRON',
  'COREL',
  'CORSAIR',
  'CRAY',
  'CREATIVE LABS',
  'CRUCIAL',
  'C-TEC',
  'CYBER',
  'CYBEROAM',
  'CYPRESS',
  'DALE',
  'DALLAS',
  'DATA EXPRESS',
  'DATA GENERAL',
  'DATACARD GROUP',
  'DATALOGIC',
  'DATAMAX',
  'DATAPRODUCTS',
  'DATARAM',
  'DATASOUTH',
  'DATEL',
  'DATSOUTH',
  'DEC',
  'DECISION DATA',
  'DELL',
  'DELTA ELECTRON',
  'DESCO',
  'DIALOGIC',
  'DIEBOLD',
  'DIGI',
  'DIGITAL LINK',
  'DIGITEL',
  'D-LINK',
  'DSI',
  'DYMO',
  'EASTERN RESEARCH',
  'EDGE',
  'ELMA',
  'ELO',
  'ELPIDA',
  'E-MACHINES',
  'EMC',
  'EMERSON',
  'EMULEX',
  'ENGENIUS',
  'ENTERASYS',
  'ENVISION',
  'EPSON',
  'EQUINOX',
  'ERICSSON',
  'EXABYTE',
  'EXTREME NETWORKS',
  'EXTRON ELECTRONICS',
  'F5',
  'FAI',
  'FAIRCHILD',
  'FARGO ELECTRONICS',
  'FELLOWES',
  'FIJITSU',
  'FINISAR',
  'FLUKE',
  'FORE SYSTEM',
  'FORTINET',
  'FOUNDRY',
  'FOXCONN',
  'FSC',
  'FUJI',
  'FUJITSU',
  'FUNAI',
  'GATEWAY',
  'GENERAL',
  'GENERAL DYNAMICS',
  'GENERAL SEMICONDUCTOR',
  'GENERIC',
  'GENICOM',
  'GIGABYTE',
  'GIGAMON',
  'GN NETCOM',
  'GOLDENRAM',
  'GOLDSTAR',
  'GRANDSTREAM NETWORKS',
  'GREENLEE TEXTRON',
  'GW INSTEK',
  'H3C',
  'HALIPLEX',
  'HANNA INSTRUMENTS',
  'HARMONIC',
  'HARRIS',
  'HEINEMANN',
  'HHP',
  'HIGHPOINT',
  'HITACHI',
  'HONEYWELL',
  'HORIZON',
  'HP',
  'HP PROCURVE',
  'HPE',
  'HTC',
  'HUAWEI',
  'HUBBELL',
  'HYNIX',
  'HYPER MICROSYSTEMS',
  'HYPERCOM',
  'HYPERTEC',
  'HYTEK',
  'HYUNDI',
  'IBM',
  'ICC',
  'IDT',
  'IMATION',
  'INFINEON',
  'INFINERA',
  'INFOCUS',
  'INGENICO',
  'INTEL',
  'INTELLIGENT',
  'INTERCONNECT',
  'INTERMEC',
  'INTER-TECH',
  'INTERTEL',
  'INTER-TEL',
  'IOGEAR',
  'IOMEGA',
  'ITOUCH',
  'IWATSU',
  'JABRA',
  'JET STREAM',
  'JUNIPER',
  'JUNIPER NETWORKS',
  'KASPERSKY LAB',
  'KEMET',
  'KENTROX',
  'KERIO',
  'KINGSTON',
  'KOA',
  'KODAK',
  'KONICA',
  'KRONE',
  'KYOCERA',
  'LABTEC',
  'LANTRONIX',
  'LARSCOM',
  'LENOVO',
  'LEXMARK',
  'LG',
  'LIEBERT',
  'LIFESIZE',
  'LIGHTWAVE',
  'LINKSYS',
  'LINUX',
  'LITE-ON',
  'LITTELFUSE',
  'LOGITECH',
  'LORAIN',
  'LSI LOGIC',
  'LUCENT',
  'LYNKSYS',
  'MAGNETEK',
  'MAGTEK',
  'MANNESMANN TALLY',
  'MARCONI',
  'MATSUSHITA',
  'MAX',
  'MAXIM',
  'MAXTOR',
  'MC DATA',
  'MELLANOX',
  'MEMOREX TELEX',
  'MERAKI',
  'METROLOGIC',
  'MICRON',
  'MICROPOLIS',
  'MICROS',
  'MICROSOFT',
  'MICROTEK',
  'MIKROTIK',
  'MILAN',
  'MINOLTA',
  'MITEL',
  'MITSUBISHI',
  'MITSUSHITA',
  'MOLEX',
  'MONSTER CABLE',
  'MOTOROLA',
  'MRV',
  'MSI',
  'MULTITECH',
  'MURATA',
  'MYTEL',
  'NAT',
  'NATIONAL SEMICONDUCTOR',
  'NBASE',
  'NCR',
  'NEC',
  'NETAPP',
  'NETGEAR',
  'NET-TO-NET',
  'NEWBRIDGE',
  'NIKON',
  'NIMBLE STORAGE',
  'NIPPON',
  'NOKIA',
  'NORAND',
  'NORSTAR',
  'NORTEL',
  'NOVELL',
  'NR SYSTEMS',
  'NRSYSTEMS',
  'NSC',
  'NVIDIA',
  'OCTEL',
  'OCZ TECHNOLOGY',
  'OKIDATA',
  'OLIVETTI',
  'OLYMPUS',
  'ONS',
  'OPZOON',
  'ORACLE',
  'ORANGE NETWORKS',
  'OVERLAND STORAGE',
  'PACKARD BELL',
  'PACKETEER',
  'PALM',
  'PALO ALTO',
  'PANASONIC',
  'PAR',
  'PARADYNE',
  'PERLE SYSTEMS',
  'PHILIP SEMICONDUCTOR',
  'PHILIPS',
  'PHILLIPS',
  'PINNACLE',
  'PIONEER',
  'PIVOTSTOR',
  'PLANAR SYSTEMS',
  'PLANTRONICS',
  'PLASMON',
  'POLYCOM',
  'POWERWARE',
  'PRINTRONIX',
  'PROCERA NETWORKS',
  'PROXIM',
  'PSC',
  'PTX',
  'PURE STORAGE',
  'Q-BIT',
  'QLOGIC',
  'QMS',
  'QNC',
  'QUALCOMM',
  'QUANTA',
  'QUANTUM',
  'QUICK EAGLE NETWORKS',
  'RackSolutions',
  'RADIAN',
  'Radiant Systems',
  'RADWARE',
  'REDHAT',
  'RGB SPECTRUM',
  'RICOH',
  'RIVERBED TECHNOLOGY',
  'RIVERSTONE',
  'ROHM',
  'ROLM',
  'RUCKUS WIRELESS',
  'SAGEN',
  'SAM',
  'SAMSUNG',
  'SAMTEC',
  'SAMTRON',
  'SANYO',
  'SEAGATE',
  'SEALEVEL SYSTEMS',
  'SEC',
  'SGI',
  'SHARP',
  'SIEMENS',
  'SIG',
  'SIMPLETECH',
  'SL POWER',
  'SNOM TECHNOLOGY',
  'SONICWALL',
  'SONY',
  'SpectraLink',
  'SPIRENT COMMUNICATIONS',
  'Startech',
  'STM',
  'STORAGETEK',
  'SUN',
  'SUPERMICRO',
  'SYMANTEC',
  'SYMBOL',
  'SYMMETRICOM',
  'SYMTECH',
  'SYSTEMAX',
  'Tadiran',
  'TALLY',
  'TANBERG DATA',
  'TANDY',
  'TARGUS',
  'TDK-LAMDA',
  'TEAC',
  'TEKTRONIX',
  'TELCO SYSTEMS',
  'TELECT',
  'TELEDYNE',
  'TELEX',
  'TELLABS',
  'TELTRONICS',
  'TELXON',
  'TEXAS',
  'THOMAS & BETTS',
  'TI',
  'TIE',
  'TippingPoint',
  'TLY',
  'TOSHIBA',
  'Transition',
  'TRANSITION NETWORKS',
  'TRENDNET',
  'TRIDENT',
  'TRIMM',
  'TRIPPLITE',
  'TROMPETER',
  'TSC',
  'TYAN',
  'TYCO',
  'TYCON POWER SYSTEMS',
  'UBIQUITI NETWORKS',
  'UCS',
  'UNICOM',
  'UNIFY',
  'UNIPAC',
  'UNIPOWER',
  'UNISPHERE',
  'UNISYS',
  'UNITECH',
  'UNIVAC',
  'US POWER',
  'US ROBOTICS',
  'VALUERAM',
  'VECIMA NETWORKS',
  'VERBATIM',
  'VERIFONE',
  'VERILINK',
  'VERITAS',
  'VIEWSONIC',
  'VIKING',
  'VISHAY',
  'VISUAL NETWORKS',
  'VMWARE',
  'VODAVI',
  'WANG',
  'WATCHGUARD',
  'WD',
  'WESTELL',
  'WESTERN DIGITAL',
  'WIN',
  'WINTEC',
  'WYSE',
  'XEL',
  'XEROX',
  'XILINX',
  'XTREME POWER',
  'XYPLEX',
  'YAMAHA',
  'YEALINK',
  'ZEBRA TECHNOLOGIES',
  'ZHONE',
  'ZILOG',
  'ZTE',
]

const OEM_LOOKUP = new Map<string, string>()
OEM_CANONICAL.forEach((name) => {
  OEM_LOOKUP.set(normalizeOemValue(name), name)
})

function isEmptyCell(v: unknown) {
  if (v === null || v === undefined) return true
  const s = String(v).trim()
  return s === ''
}

function rowHasAnyValue(row: unknown[]) {
  return row.some((c) => !isEmptyCell(c))
}

function extractComponents(extras: Record<string, string>) {
  const specs: Record<string, unknown> = {}
  let cpu: string | null = null
  let memory: string | null = null
  let gpu: string | null = null
  let drives: string | null = null

  for (const [kRaw, v] of Object.entries(extras)) {
    const k = normKey(kRaw)
    if (!v) continue

    if (!cpu && (k.includes('cpu') || k.includes('processor'))) cpu = v
    if (!gpu && k.includes('gpu')) gpu = v
    if (!memory && (k.includes('memory') || k.includes('dimm') || k.includes('ram'))) memory = v
    if (
      !drives &&
      (k.includes('drive') || k.includes('ssd') || k.includes('hdd') || k.includes('nvme') || k.includes('disk') || k.includes('storage'))
    ) {
      drives = v
    }

    specs[kRaw] = v
  }

  if (drives) specs.drives = drives

  return {
    cpu: cpu || null,
    memory_part_numbers: memory || null,
    gpu: gpu || null,
    specs: Object.keys(specs).length ? specs : null,
  }
}

function detectOem(model: string | null | undefined, desc: string | null | undefined, extras: string | null | undefined = ''): string {
  const textRaw = `${model ?? ''} ${desc ?? ''} ${extras ?? ''}`.toLowerCase()
  const norm = textRaw.replace(/[^a-z0-9]+/g, ' ')
  const tokens = new Set(norm.split(' ').filter(Boolean))

  for (const t of tokens) {
    const canonical = OEM_LOOKUP.get(normalizeOemValue(t))
    if (canonical) return canonical
  }
  const merged = normalizeOemValue(norm)
  const mergedCanonical = OEM_LOOKUP.get(merged)
  if (mergedCanonical) return mergedCanonical

  const pairs: Array<[string, string[]]> = [
    ['Dell', ['dell', 'emc', 'poweredge']],
    ['HPE', ['hpe', 'hewlett', 'hp', 'proliant', 'dl', 'bl']],
    ['Cisco', ['cisco', 'cisco systems', 'ucs', 'nexus', 'catalyst', 'asa']],
    ['NetApp', ['netapp', 'net', 'ontap', 'aff', 'fas', 'filer']],
    ['Lenovo', ['lenovo', 'ibm', 'thinksystem']],
    ['Supermicro', ['supermicro', 'smci']],
    ['Juniper', ['juniper']],
    ['Arista', ['arista']],
    ['Brocade', ['brocade']],
    ['Ubiquiti', ['ubiquiti', 'unifi', 'edge']],
    ['Fortinet', ['fortinet', 'fortigate']],
    ['Palo Alto', ['palo', 'alto', 'pa']],
    ['Extreme', ['extreme']],
    ['Netgear', ['netgear']],
    ['Huawei', ['huawei']],
    ['VMware', ['vmware', 'vsan', 'esxi']],
  ]

  for (const [oem, keys] of pairs) {
    for (const k of keys) {
      const cleaned = k.replace(/[^a-z0-9]+/g, ' ').trim()
      if (!cleaned) continue
      if (norm.includes(cleaned)) return oem
      if (tokens.has(cleaned)) return oem
    }
  }
  return 'Other'
}

function pickDefaultHeaderRow(grid: unknown[][]) {
  for (let i = 0; i < Math.min(grid.length, 50); i++) {
    const r = grid[i] ?? []
    if (!rowHasAnyValue(r)) continue
    const cells = r.filter((c) => !isEmptyCell(c))
    if (!cells.length) continue
    const str = cells.filter((c) => typeof c === 'string' && String(c).trim().length >= 2).length
    const num = cells.filter((c) => typeof c === 'number').length
    if (str >= 2 && str >= num) return i
  }
  for (let i = 0; i < grid.length; i++) if (rowHasAnyValue(grid[i] ?? [])) return i
  return 0
}

function bestColumnMatch(cols: string[], candidates: string[]) {
  const ncols = cols.map((c) => normKey(c))
  const ncands = candidates.map((c) => normKey(c))
  for (let i = 0; i < ncols.length; i++) {
    for (const cand of ncands) {
      if (!cand) continue
      if (ncols[i] === cand) return cols[i]
      if (ncols[i].includes(cand) || cand.includes(ncols[i])) return cols[i]
    }
  }
  return ''
}

export default function NewLotPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [tenantId, setTenantId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // lot fields
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>('') // constrained by lots_category_check
  const [currency, setCurrency] = useState('USD')

  // IMPORTANT: keep these aligned with your DB CHECK constraint values.
  // If your constraint differs, tell me the allowed values and I’ll update this list.
  const LOT_CATEGORIES = useMemo(
    () => [
      { value: '', label: '— Select —' },
      { value: 'servers', label: 'Servers' },
      { value: 'storage', label: 'Storage' },
      { value: 'networking', label: 'Networking' },
      { value: 'security', label: 'Security' },
      { value: 'compute_parts', label: 'Compute parts' },
      { value: 'memory', label: 'Memory' },
      { value: 'disks', label: 'Disks' },
      { value: 'other', label: 'Other' },
    ],
    []
  )

  // seller + cost
  const [sellers, setSellers] = useState<Seller[]>([])
  const [sellerId, setSellerId] = useState<string>('')
  const [costPaid, setCostPaid] = useState<string>('')

  // XLSX import
  const [importName, setImportName] = useState<string>('')
  const [importErr, setImportErr] = useState<string>('')

  const [grid, setGrid] = useState<unknown[][]>([])
  const [headerRowIdx, setHeaderRowIdx] = useState<number>(0)

  const [mapModel, setMapModel] = useState<string>('')
  const [mapDesc, setMapDesc] = useState<string>('')
  const [mapQty, setMapQty] = useState<string>('')
  const [mapAsk, setMapAsk] = useState<string>('')
  const [mapCost, setMapCost] = useState<string>('')

  // manual line entry
  const [manualRows, setManualRows] = useState<ParsedLine[]>([])
  const [manualModel, setManualModel] = useState('')
  const [manualDesc, setManualDesc] = useState('')
  const [manualQty, setManualQty] = useState('')
  const [manualAsk, setManualAsk] = useState('')
  const [manualCost, setManualCost] = useState('')

  const [extraCols, setExtraCols] = useState<Set<string>>(new Set())
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [lotApprovals, setLotApprovals] = useState<Record<string, boolean>>({})
  const [lotBuyerMap, setLotBuyerMap] = useState<Record<string, Set<string>>>({})
  const [splitMode, setSplitMode] = useState<'auto' | 'split' | 'keep'>('auto')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const profile = await ensureProfile()
      setTenantId(profile.tenant_id)

      const { data: sData, error: sErr } = await supabase
        .from('sellers')
        .select('id,tenant_id,name,company,email,phone')
        .eq('tenant_id', profile.tenant_id)
        .order('company', { ascending: true })
        .order('name', { ascending: true })
        .limit(5000)

      if (sErr) throw sErr
      setSellers((sData as Seller[]) ?? [])

      const { data: bData, error: bErr } = await supabase
        .from('buyers')
        .select('id,tenant_id,name,company,email')
        .eq('tenant_id', profile.tenant_id)
        .order('company', { ascending: true })
        .order('name', { ascending: true })
        .limit(5000)
      if (bErr) throw bErr
      setBuyers((bData as Buyer[]) ?? [])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const columns = useMemo(() => {
    if (!grid.length) return []
    const header = grid[headerRowIdx] ?? []
    const width = Math.max(...grid.map((r) => (r ? r.length : 0)), 1)
    const out: string[] = []
    for (let i = 0; i < width; i++) {
      const v = header?.[i]
      const s = String(v ?? '').trim()
      out.push(s || `Column ${i + 1}`)
    }
    return out
  }, [grid, headerRowIdx])

  const colIndex = useMemo(() => {
    const m = new Map<string, number>()
    columns.forEach((c, i) => m.set(c, i))
    return m
  }, [columns])

  useEffect(() => {
    if (!columns.length) return

    const modelGuess = bestColumnMatch(columns, ['model', 'product', 'item', 'sku', 'part', 'part_number', 'pn'])
    const descGuess = bestColumnMatch(columns, ['description', 'desc', 'details', 'item_description', 'name'])
    const qtyGuess = bestColumnMatch(columns, ['qty', 'quantity', 'units', 'unit_qty'])
    const askGuess = bestColumnMatch(columns, ['asking_price', 'ask', 'price', 'unit_price', 'unitprice'])
    const costGuess = bestColumnMatch(columns, ['cost', 'unit_cost', 'cost_price', 'purchase_price'])

    setMapModel((prev) => prev || modelGuess)
    setMapDesc((prev) => prev || descGuess)
    setMapQty((prev) => prev || qtyGuess)
    setMapAsk((prev) => prev || askGuess)
    setMapCost((prev) => prev || costGuess)

    const preferred = [
      'serial',
      'service_tag',
      'servicetag',
      'tag',
      'asset_tag',
      'cpu',
      'cpu_part',
      'cpu_partnumber',
      'processor',
      'cpu_count',
      'cores',
      'ram',
      'dimm',
      'dimm_part',
      'dimm_partnumber',
      'dimm_count',
      'memory',
      'ssd',
      'hdd',
      'nvme',
      'storage',
      'raid',
      'nic',
      'network',
      'hba',
      'fc',
      'psu',
      'power',
      'chassis',
      'generation',
    ]

    const found = columns.filter((c) => {
      const nk = normKey(c)
      return preferred.some((p) => nk.includes(normKey(p)) || normKey(p).includes(nk))
    })

    setExtraCols((prev) => {
      if (prev.size) return prev
      const next = new Set<string>()
      for (const f of found) next.add(f)
      const strong = columns.filter((c) => {
        const nk = normKey(c)
        return nk.includes('serial') || nk.includes('service') || nk.includes('tag')
      })
      for (const f of strong) next.add(f)
      return next
    })
  }, [columns])

  const parsedImports: ParsedLine[] = useMemo(() => {
    if (!grid.length || !columns.length) return []

    const dataStart = headerRowIdx + 1
    const rows = grid.slice(dataStart)

    const idx = (col: string) => (col ? colIndex.get(col) ?? -1 : -1)
    const iModel = idx(mapModel)
    const iDesc = idx(mapDesc)
    const iQty = idx(mapQty)
    const iAsk = idx(mapAsk)
    const iCost = idx(mapCost)
    const oemCol = bestColumnMatch(columns, ['oem', 'manufacturer', 'vendor', 'brand', 'make'])
    const iOem = idx(oemCol)

    const extras = Array.from(extraCols)
    const out: ParsedLine[] = []
    let lastOem = ''

    for (const r of rows) {
      if (!r || !Array.isArray(r)) continue
      if (!rowHasAnyValue(r)) continue

      const model = iModel >= 0 ? String(r[iModel] ?? '').trim() : ''
      const desc = iDesc >= 0 ? String(r[iDesc] ?? '').trim() : ''

      let qty: number | null = null
      if (iQty >= 0) {
        const q = toNum(r[iQty])
        qty = q == null ? null : Math.round(q)
      }
      if (qty == null) qty = 1

      const ask = iAsk >= 0 ? toNum(r[iAsk]) : null
      const cost = iCost >= 0 ? toNum(r[iCost]) : null

      const detailLines: string[] = []
      const extraValues: Record<string, string> = {}
      for (const c of extras) {
        const j = colIndex.get(c)
        if (j == null || j < 0) continue
        const v = r[j]
        if (v === null || v === undefined) continue
        const s = String(v).trim()
        if (!s) continue
        detailLines.push(`${c}: ${s}`)
        extraValues[c] = s
      }

      const baseModel = model || null
      let oemCell = iOem >= 0 ? String(r[iOem] ?? '').trim() : ''
      if (oemCell) {
        lastOem = oemCell
      } else if (lastOem) {
        oemCell = lastOem
      }
      if (oemCell) {
        extraValues.OEM = oemCell
        detailLines.push(`OEM: ${oemCell}`)
      }

      const rowTextParts = Array.isArray(r) ? r.map((cell) => String(cell ?? '').trim()) : []
      const firstNonEmptyCell = rowTextParts.find((v) => v) ?? ''

      // allow fallback to any non-empty cell for model/description so we don't drop rows with OEM-only info
      const safeModel = baseModel || firstNonEmptyCell || null

      let finalDesc = desc || model || firstNonEmptyCell || ''
      if (detailLines.length) {
        finalDesc = finalDesc ? `${finalDesc}\n${detailLines.join('\n')}` : detailLines.join('\n')
      }
      const description = finalDesc.trim() ? finalDesc.trim() : null

      const comps = extractComponents(extraValues)
      const extrasText = Object.entries(extraValues)
        .map(([k, v]) => `${k} ${v}`)
        .join(' ')
      const rowAllText = rowTextParts.join(' ')
      const oemFromCell = (() => {
        const lc = oemCell.toLowerCase()
        if (!lc) return ''
        if (lc.includes('cisco')) return 'Cisco'
        if (lc.includes('netapp') || lc.includes('net app')) return 'NetApp'
        if (lc.includes('dell') || lc.includes('emc')) return 'Dell'
        if (lc.includes('hp ') || lc === 'hp' || lc.includes('hpe') || lc.includes('hewlett')) return 'HPE'
        return ''
      })()
      const detected = detectOem(safeModel, description, `${extrasText} ${rowAllText}`)
      const oem = oemFromCell || detected

      if (qty != null && qty <= 0) continue

      out.push({
        model: safeModel,
        description,
        qty,
        asking_price: ask,
        cost,
        cpu: comps.cpu,
        memory_part_numbers: comps.memory_part_numbers,
        gpu: comps.gpu,
        // store oem in specs for grouping
        ...(comps.specs ? { specs: { ...comps.specs, oem_guess: oem } } : { specs: { oem_guess: oem } }),
      })
    }

    return out
  }, [grid, columns, headerRowIdx, mapModel, mapDesc, mapQty, mapAsk, mapCost, extraCols, colIndex])

  const importRows: ParsedLine[] = useMemo(() => {
    return [...manualRows, ...parsedImports]
  }, [manualRows, parsedImports])

  const preview = useMemo(() => importRows.slice(0, 8), [importRows])
  const groupedLots = useMemo(() => {
    const groups = new Map<string, ParsedLine[]>()
    for (const row of importRows) {
      const specObj = (row.specs ?? {}) as Record<string, unknown>
      const oemGuess = typeof specObj.oem_guess === 'string' ? specObj.oem_guess : null
      const oem = oemGuess || 'Other'
      const arr = groups.get(oem) ?? []
      arr.push(row)
      groups.set(oem, arr)
    }
    return Array.from(groups.entries()).map(([oem, rows]) => ({
      oem,
      rows,
    }))
  }, [importRows])

  useEffect(() => {
    if (!groupedLots.length) {
      setLotApprovals({})
      setLotBuyerMap({})
      return
    }
    setLotApprovals((prev) => {
      const next: Record<string, boolean> = {}
      for (const g of groupedLots) {
        next[g.oem] = prev[g.oem] ?? true
      }
      return next
    })
    setLotBuyerMap((prev) => {
      const next: Record<string, Set<string>> = {}
      for (const g of groupedLots) {
        next[g.oem] = prev[g.oem] ?? new Set<string>()
      }
      return next
    })
    if (groupedLots.length > 1 && splitMode === 'auto') {
      setSplitMode('split')
    }
  }, [groupedLots, splitMode])

  const canSave = useMemo(() => {
    if (!tenantId) return false
    if (!title.trim()) return false
    if (!currency.trim()) return false
    if (!groupedLots.length) return false
    // type is optional, but if set must be in allowed list
    const allowed = new Set(LOT_CATEGORIES.map((t) => t.value).filter(Boolean))
    if (category && !allowed.has(category)) return false
    return true
  }, [tenantId, title, currency, category, LOT_CATEGORIES, groupedLots.length])

  const clearImport = () => {
    setImportName('')
    setImportErr('')
    setGrid([])
    setHeaderRowIdx(0)
    setMapModel('')
    setMapDesc('')
    setMapQty('')
    setMapAsk('')
    setExtraCols(new Set())
    if (fileRef.current) fileRef.current.value = ''
  }

  const parseXlsx = async (file: File) => {
    setImportErr('')
    setGrid([])
    setImportName(file.name)

    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames?.[0]
      if (!sheetName) throw new Error('No sheets found in workbook')
      const ws = wb.Sheets[sheetName]

      const rawGrid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true }) as unknown[][]
      if (!rawGrid.length) throw new Error('Sheet is empty')

      const width = Math.max(...rawGrid.map((r) => (Array.isArray(r) ? r.length : 0)), 1)
      const normalized = rawGrid.map((r) => {
        const rr = Array.isArray(r) ? r.slice(0) : []
        while (rr.length < width) rr.push(null)
        return rr
      })

      const guess = pickDefaultHeaderRow(normalized)
      setGrid(normalized)
      setHeaderRowIdx(guess)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to parse XLSX'
      setImportErr(msg)
      setGrid([])
    }
  }

  const onPickFile = async (f: File | null) => {
    if (!f) return
    const name = (f.name || '').toLowerCase()
    if (!name.endsWith('.xlsx')) {
      setImportErr('Please upload an .xlsx file')
      setGrid([])
      setImportName(f.name || '')
      return
    }
    await parseXlsx(f)
  }

  const downloadTemplate = async () => {
    try {
      const res = await fetch('/api/proforma-template')
      if (!res.ok) throw new Error('Failed to generate template')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'proforma_stock_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'Download failed')
    }
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')

    try {
      let supportsGroupToken = true
      const groupToken = splitMode === 'split' && groupedLots.length > 1 ? crypto.randomUUID() : null
      const allowed = new Set(LOT_CATEGORIES.map((t) => t.value).filter(Boolean))
      const safeCategory = category && allowed.has(category) ? category : null
      const groupsToCreate =
        splitMode === 'keep'
          ? [
              {
                oem: 'All',
                rows: importRows,
              },
            ]
          : groupedLots.filter((g) => lotApprovals[g.oem] !== false)
      if (!groupsToCreate.length) throw new Error('Select at least one OEM lot to create')

      const createdLotIds: string[] = []

      for (const group of groupsToCreate) {
        const lotTitle =
          splitMode === 'keep'
            ? title.trim() || 'New lot'
            : title.trim()
            ? `${title.trim()} - ${group.oem}`
            : `${group.oem} lot`

        const lotInsert = {
          tenant_id: tenantId,
          title: lotTitle,
          // keep type valid for lots_type_check
          type: 'priced',
          // constrained by lots_category_check
          category: safeCategory,
          currency: currency.trim() || 'USD',
          status: 'draft',
          seller_id: sellerId || null,
          ...(supportsGroupToken && groupToken ? { group_token: groupToken } : {}),
        }

        const attemptInsert = async (payload: typeof lotInsert) => {
          return await supabase.from('lots').insert(payload).select('id').single()
        }

        let lotId: string | null = null
        let lotErr: unknown = null
        let firstTry = await attemptInsert(lotInsert)
        if (firstTry.error && String(firstTry.error.message || '').toLowerCase().includes('group_token')) {
          supportsGroupToken = false
          firstTry = await attemptInsert({ ...lotInsert, group_token: undefined as unknown as never })
        }
        if (firstTry.error) {
          lotErr = firstTry.error
        } else {
          lotId = (firstTry.data as { id: string }).id
        }
        if (lotErr || !lotId) throw lotErr || new Error('Failed to create lot')
        createdLotIds.push(lotId)

        const cost = costPaid.trim() ? toNum(costPaid) : null
        if (cost !== null) {
          const { error: finErr } = await supabase.from('lot_financials').upsert(
            {
              tenant_id: tenantId,
              lot_id: lotId,
              cost_basis: 'asking_known', // MUST be one of the allowed values in DB
              cost_amount: cost,
              cost_currency: currency.trim() || 'USD',
            },
            { onConflict: 'lot_id' }
          )
          if (finErr) throw finErr
        }

        if (group.rows.length) {
          const batchSize = 500
          for (let i = 0; i < group.rows.length; i += batchSize) {
            const chunk = group.rows.slice(i, i + batchSize)
            const payload = chunk.map((r) => ({
              lot_id: lotId,
              model: r.model,
              description: r.description,
              qty: r.qty ?? 1,
              asking_price: r.asking_price,
              cost: r.cost ?? null,
              cpu: r.cpu ?? null,
              memory_part_numbers: r.memory_part_numbers ?? null,
              gpu: r.gpu ?? null,
              specs: r.specs ?? null,
            }))

            const { error: insErr } = await supabase.from('line_items').insert(payload)
            if (insErr) throw insErr
          }
        }

        const selectedBuyers = Array.from(lotBuyerMap[group.oem] ?? [])
        if (selectedBuyers.length) {
          const invitePayload = selectedBuyers.map((bid) => ({
            tenant_id: tenantId,
            lot_id: lotId,
            buyer_id: bid,
            status: 'invited',
          }))
          const { error: invErr } = await supabase.from('lot_invites').insert(invitePayload)
          if (invErr) throw invErr

          const { error: statusErr } = await supabase.from('lots').update({ status: 'open' }).eq('id', lotId).eq('tenant_id', tenantId)
          if (statusErr) throw statusErr
        }
      }

      const dest =
        splitMode === 'keep'
          ? createdLotIds.length
            ? `/dashboard/lots/${createdLotIds[0]}/invite`
            : '/dashboard/lots'
          : createdLotIds.length
          ? `/dashboard/lots?new=${createdLotIds.join(',')}`
          : '/dashboard/lots'
      router.push(dest)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to create lot'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main>
        <h1 style={{ marginBottom: 6 }}>New lot</h1>
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      </main>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>New lot</h1>
          <div style={{ color: 'var(--muted)' }}>Create a lot, upload items from XLSX, and store seller + cost (private).</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/dashboard/lots" style={{ textDecoration: 'none' }}>
            ← Back
          </Link>

          <button
            onClick={save}
            disabled={!canSave || saving}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
              color: '#fff',
              fontWeight: 950,
              cursor: 'pointer',
              opacity: !canSave || saving ? 0.65 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Create lot'}
          </button>
        </div>
      </div>

      <hr style={{ margin: '16px 0', borderColor: 'var(--border)' }} />

      {error ? <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div> : null}

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 16,
          background: 'var(--panel)',
          padding: 14,
          boxShadow: 'var(--shadow)',
          maxWidth: 960,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Lot title *</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dell Servers Mixed (R740/R640)"
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                color: 'var(--text)',
                fontWeight: 800,
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 220px', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Type</div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  fontWeight: 900,
                }}
              >
                {LOT_CATEGORIES.map((t) => (
                  <option key={t.value || 'blank'} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                Must match your DB allowed values (prevents “lots_type_check” errors).
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Currency *</div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  fontWeight: 900,
                }}
              >
                <option value="USD">USD</option>
                <option value="ZAR">ZAR</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Cost currency</div>
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.08)',
                  color: 'var(--text)',
                  fontWeight: 900,
                }}
              >
                {currency}
              </div>
            </div>
          </div>

          <hr style={{ margin: '6px 0', borderColor: 'var(--border)' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Who you bought it from (Seller)</div>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  fontWeight: 900,
                }}
              >
                <option value="">— Unassigned —</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sellerLabel(s)}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>Internal only (never shown to buyers).</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>How much you paid (cost)</div>
              <input
                value={costPaid}
                onChange={(e) => setCostPaid(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 25000"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  fontWeight: 900,
                }}
              />
              <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>Stored in lot_financials (private).</div>
            </div>
          </div>

          <hr style={{ margin: '6px 0', borderColor: 'var(--border)' }} />

          {/* Manual entry */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Add line items manually</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
              Quick add without XLSX. Cost stays private to you; buyers never see it.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 100px 120px 120px 120px', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Model"
                value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
              <input
                placeholder="Description"
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
              />
              <input
                placeholder="Qty"
                value={manualQty}
                onChange={(e) => setManualQty(e.target.value)}
                inputMode="numeric"
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', width: '100%' }}
              />
              <input
                placeholder="Asking"
                value={manualAsk}
                onChange={(e) => setManualAsk(e.target.value)}
                inputMode="decimal"
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', width: '100%' }}
              />
              <input
                placeholder="Cost (private)"
                value={manualCost}
                onChange={(e) => setManualCost(e.target.value)}
                inputMode="decimal"
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => {
                  const qtyNum = toNum(manualQty)
                  const askNum = toNum(manualAsk)
                  const costNum = toNum(manualCost)
                  const row: ParsedLine = {
                    model: manualModel.trim() || null,
                    description: manualDesc.trim() || null,
                    qty: qtyNum ?? 1,
                    asking_price: askNum,
                    cost: costNum,
                  }
                  if (!row.model && !row.description) return
                  setManualRows((prev) => [...prev, row])
                  setManualModel('')
                  setManualDesc('')
                  setManualQty('')
                  setManualAsk('')
                  setManualCost('')
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Add line
              </button>
            </div>
            {manualRows.length ? (
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: 8, background: 'rgba(0,0,0,0.06)', fontWeight: 900, display: 'flex', justifyContent: 'space-between' }}>
                  <div>Manual lines ({manualRows.length})</div>
                  <button
                    type="button"
                    onClick={() => setManualRows([])}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'rgba(0,0,0,0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
                {manualRows.map((r, idx) => (
                  <div
                    key={`${r.model ?? ''}-${idx}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 120px 140px 140px',
                      borderTop: idx === 0 ? 'none' : `1px solid var(--border)`,
                    }}
                  >
                    <div style={{ padding: 8 }}>
                      <div style={{ fontWeight: 900 }}>{r.model ?? '-'}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.description ?? '-'}</div>
                    </div>
                    <div style={{ padding: 8, fontWeight: 900 }}>{r.qty ?? '-'}</div>
                    <div style={{ padding: 8, fontWeight: 900 }}>{fmtMoney(r.asking_price, currency)}</div>
                    <div style={{ padding: 8, fontWeight: 900 }}>{fmtMoney(r.cost ?? null, currency)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <hr style={{ margin: '6px 0', borderColor: 'var(--border)' }} />

          {/* XLSX upload */}
          <div>
            <div style={{ fontWeight: 950, marginBottom: 6 }}>Upload line items (XLSX)</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
              Messy sheet? No problem — choose your header row and map the columns below.
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />

              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Choose XLSX
              </button>

              <button
                type="button"
                onClick={downloadTemplate}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.06)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Download proforma stock template
              </button>

              {importName ? (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  <b style={{ color: 'var(--text)' }}>{importName}</b> • {importRows.length} rows ready
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>No file selected.</div>
              )}

              {importName ? (
                <button
                  onClick={() => clearImport()}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'rgba(0,0,0,0.10)',
                    color: 'var(--text)',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {importErr ? <div style={{ marginTop: 10, color: 'crimson' }}>{importErr}</div> : null}

            {/* Preview editor */}
            {grid.length ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 950, marginBottom: 6 }}>Preview editor</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>
                  1) Pick the header row. 2) Map your columns. 3) Choose extra columns to include for buyers.
                </div>
                {groupedLots.length > 1 ? (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      background: 'rgba(245,174,109,0.1)',
                    }}
                  >
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Multiple OEMs detected ({groupedLots.length}).</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setSplitMode('split')}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: splitMode === 'split' ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: splitMode === 'split' ? 'rgba(245,174,109,0.2)' : 'var(--panel)',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Split list into OEM sub-lots
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplitMode('keep')}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: splitMode === 'keep' ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: splitMode === 'keep' ? 'rgba(245,174,109,0.2)' : 'var(--panel)',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Keep as one lot
                      </button>
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                      Split: creates one lot per OEM (with invites if selected). Keep: one combined lot with all items.
                    </div>
                  </div>
                ) : null}

                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, alignItems: 'start' }}>
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 12,
                      background: 'rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Header row</div>
                    <select
                      value={String(headerRowIdx)}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setHeaderRowIdx(Number.isFinite(v) ? v : 0)
                        setMapModel('')
                        setMapDesc('')
                        setMapQty('')
                        setMapAsk('')
                        setMapCost('')
                        setExtraCols(new Set())
                      }}
                      style={{
                        width: '100%',
                        padding: 10,
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        fontWeight: 900,
                      }}
                    >
                      {Array.from({ length: Math.min(grid.length, 60) }).map((_, i) => (
                        <option key={i} value={String(i)}>
                          Row {i + 1}{i === headerRowIdx ? ' (selected)' : ''}
                        </option>
                      ))}
                    </select>

                    <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                      Tip: if your sheet has logos/headers above the table, pick the row where your column names start.
                    </div>
                  </div>

                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 12,
                      background: 'rgba(0,0,0,0.04)',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
                      {[
                        ['Model', mapModel, setMapModel],
                        ['Description', mapDesc, setMapDesc],
                        ['Qty', mapQty, setMapQty],
                        ['Asking price', mapAsk, setMapAsk],
                        ['Cost (private)', mapCost, setMapCost],
                      ].map(([label, value, setter]) => (
                        <div key={String(label)}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{label as string}</div>
                          <select
                            value={value as string}
                            onChange={(e) =>
                              (setter as React.Dispatch<React.SetStateAction<string>>)(String(e.target.value))
                            }
                            style={{
                              width: '100%',
                              padding: 10,
                              borderRadius: 12,
                              border: '1px solid var(--border)',
                              background: 'var(--panel)',
                              color: 'var(--text)',
                              fontWeight: 900,
                            }}
                          >
                            <option value="">— Not mapped —</option>
                            {columns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                        Extra columns to include (packed into Description as key/value lines)
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {columns.map((c) => {
                          const checked = extraCols.has(c)
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                setExtraCols((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(c)) next.delete(c)
                                  else next.add(c)
                                  return next
                                })
                              }}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 999,
                                border: `1px solid ${checked ? 'rgba(245,174,109,0.35)' : 'var(--border)'}`,
                                background: checked ? 'rgba(245,174,109,0.12)' : 'var(--panel)',
                                color: 'var(--text)',
                                fontWeight: 900,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                              title={checked ? 'Included' : 'Not included'}
                            >
                              {checked ? '✓ ' : ''}{c}
                            </button>
                          )
                        })}
                      </div>

                      <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                        Default qty is <b style={{ color: 'var(--text)' }}>1</b> if not mapped.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 8 }}>
                    Preview (first {preview.length}). These will be inserted into <b>line_items</b> when you click “Create lot”.
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 120px 160px 160px',
                        gap: 0,
                        background: 'rgba(0,0,0,0.08)',
                      }}
                    >
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 950 }}>Model / Description</div>
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 950 }}>Qty</div>
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 950 }}>Asking</div>
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 950 }}>Cost (private)</div>
                    </div>

                    {preview.map((r, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 120px 160px 160px',
                          gap: 0,
                          borderTop: idx === 0 ? 'none' : `1px solid var(--border)`,
                        }}
                      >
                        <div style={{ padding: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          <div style={{ fontWeight: 900 }}>{r.model ?? '—'}</div>
                          <div style={{ color: 'var(--muted)', marginTop: 2 }}>{r.description ?? '—'}</div>
                        </div>
                        <div style={{ padding: 10, fontSize: 12, fontWeight: 900 }}>{r.qty ?? '-'}</div>
                        <div style={{ padding: 10, fontSize: 12, fontWeight: 900 }}>{fmtMoney(r.asking_price, currency)}</div>
                        <div style={{ padding: 10, fontSize: 12, fontWeight: 900 }}>{fmtMoney(r.cost ?? null, currency)}</div>
                      </div>
                    ))}
                  </div>

                  {!importRows.length ? (
                    <div style={{ marginTop: 10, color: 'crimson' }}>
                      No rows detected yet. Adjust the header row and mappings until the preview populates.
                    </div>
                  ) : null}

                  {importRows.length > preview.length ? (
                    <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
                      Showing {preview.length} of {importRows.length}…
                    </div>
                  ) : null}
                </div>

                {groupedLots.length ? (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontWeight: 950, marginBottom: 4 }}>Detected OEM lots ({groupedLots.length})</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
                      Approve each lot, see the first 10 lines, and optionally pre-invite buyers. Lots start as <b>draft</b>; if you pre-invite
                      buyers here, the lot will move to <b>open</b> automatically.
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>
                      Processed <b style={{ color: 'var(--text)' }}>{importRows.length}</b> rows after the selected header row; previews below
                      show the first 10 lines per OEM.
                    </div>

                    {splitMode === 'split' ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {groupedLots.map((g) => {
                          const approved = lotApprovals[g.oem] !== false
                          const sample = g.rows.slice(0, 10)
                          const buyersForLot = lotBuyerMap[g.oem] ?? new Set<string>()
                          const titlePreview = title.trim() ? `${title.trim()} - ${g.oem}` : `${g.oem} lot`
                          return (
                            <div
                              key={g.oem}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 12,
                                padding: 12,
                                background: 'rgba(0,0,0,0.03)',
                                opacity: approved ? 1 : 0.65,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={approved}
                                    onChange={() => setLotApprovals((prev) => ({ ...prev, [g.oem]: !approved }))}
                                  />
                                  <div>
                                    <div style={{ fontWeight: 900 }}>{g.oem}</div>
                                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                                      {g.rows.length} lines · Title preview: <b style={{ color: 'var(--text)' }}>{titlePreview}</b>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ minWidth: 260 }}>
                                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Invite buyers immediately (optional)</div>
                                  <select
                                    multiple
                                    value={Array.from(buyersForLot)}
                                    onChange={(e) => {
                                      const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
                                      setLotBuyerMap((prev) => ({ ...prev, [g.oem]: new Set(selected) }))
                                    }}
                                    size={Math.min(Math.max(buyers.length, 3), 8)}
                                    style={{
                                      width: '100%',
                                      padding: 8,
                                      borderRadius: 10,
                                      border: '1px solid var(--border)',
                                      background: 'var(--panel)',
                                      color: 'var(--text)',
                                    }}
                                  >
                                    {buyers.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.company ? `${b.company} (${b.name})` : b.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div style={{ marginTop: 10 }}>
                                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>First {sample.length} lines</div>
                                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '2fr 120px 160px 160px',
                                      gap: 0,
                                      background: 'rgba(0,0,0,0.06)',
                                    }}
                                  >
                                    <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Model / Description</div>
                                    <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Qty</div>
                                    <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Asking</div>
                                    <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Cost (private)</div>
                                  </div>
                                  {sample.map((r, idx) => (
                                    <div
                                      key={idx}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: '2fr 120px 160px 160px',
                                        gap: 0,
                                        borderTop: idx === 0 ? 'none' : `1px solid var(--border)`,
                                      }}
                                    >
                                      <div style={{ padding: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                                        <div style={{ fontWeight: 900 }}>{r.model ?? '—'}</div>
                                        <div style={{ color: 'var(--muted)', marginTop: 2 }}>{r.description ?? '—'}</div>
                                      </div>
                                      <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{r.qty ?? '-'}</div>
                                      <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{fmtMoney(r.asking_price, currency)}</div>
                                      <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{fmtMoney(r.cost ?? null, currency)}</div>
                                    </div>
                                  ))}
                                </div>
                                {g.rows.length > sample.length ? (
                                  <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
                                    Showing first {sample.length} of {g.rows.length} lines.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: 12,
                          background: 'rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ fontWeight: 900, marginBottom: 6 }}>Combined lot preview</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 6 }}>
                          All OEMs will be kept in a single lot. Showing first {Math.min(importRows.length, 10)} of {importRows.length} lines.
                        </div>
                        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '2fr 120px 160px 160px',
                              gap: 0,
                              background: 'rgba(0,0,0,0.06)',
                            }}
                          >
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Model / Description</div>
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Qty</div>
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Asking</div>
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>Cost (private)</div>
                          </div>
                          {importRows.slice(0, 10).map((r, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 120px 160px 160px',
                                gap: 0,
                                borderTop: idx === 0 ? 'none' : `1px solid var(--border)`,
                              }}
                            >
                              <div style={{ padding: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                                <div style={{ fontWeight: 900 }}>{r.model ?? '—'}</div>
                                <div style={{ color: 'var(--muted)', marginTop: 2 }}>{r.description ?? '—'}</div>
                              </div>
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{r.qty ?? '-'}</div>
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{fmtMoney(r.asking_price, currency)}</div>
                            <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{fmtMoney(r.cost ?? null, currency)}</div>
                          </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12 }}>
            After creating, you can still edit items, invite buyers, and run rounds.
          </div>
        </div>
      </div>
    </main>
  )
}
