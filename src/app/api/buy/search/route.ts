import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const term = (url.searchParams.get('term') || '').trim()
    const toNum = (val: unknown) => {
      if (val === null || val === undefined || val === '') return null
      const n = Number(val)
      return Number.isFinite(n) ? n : null
    }
    const toText = (val: unknown) => (val === null || val === undefined ? null : String(val))

    const supa = supabaseServer()
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace(/Bearer\s+/i, '')
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    // Basic auth profile lookup for tenant context (not strictly required for stub)
    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr

    // If no term, short circuit
    if (!term) {
      return NextResponse.json({ ok: true, results: [] })
    }

    const ilike = `%${term}%`
    const statuses = ['available', 'auction', 'reserved']

    const { data: items, error: invErr } = await supa
      .from('inventory_items')
      .select('id,tenant_id,model,description,oem,condition,category,qty_available,qty_total,status,location,currency,cost')
      .or(`model.ilike.${ilike},description.ilike.${ilike},oem.ilike.${ilike}`)
      .in('status', statuses)
      .neq('tenant_id', profile?.tenant_id ?? '')
      .limit(500)

    if (invErr) throw invErr

    const supplierIds = Array.from(new Set((items ?? []).map((r) => r.tenant_id).filter(Boolean)))
    const { data: tenants, error: tenantErr } = await supa.from('tenants').select('id,name').in('id', supplierIds)
    if (tenantErr) throw tenantErr
    const tenantMap = new Map<string, string>((tenants ?? []).map((t) => [String(t.id), t.name ?? 'Unknown supplier']))

    type ComponentItem = {
      id: string
      model: string | null
      description: string | null
      oem: string | null
      qty_available: number | null
      currency: string | null
    }

    type ItemResult = {
      id: string
      tenant_id: string
      model: string | null
      description: string | null
      oem: string | null
      condition: string | null
      category: string | null
      qty_available: number | null
      qty_total: number | null
      status: string | null
      location: string | null
      currency: string | null
      cost: number | null
      components: ComponentItem[]
      source_count: number
      components_mixed: boolean
    }

    type Group = { supplier_tenant_id: string; supplier_name: string; items: ItemResult[] }

    const normalized: ItemResult[] = (items ?? []).map((row) => {
      const rec = row as Record<string, unknown>
      return {
        id: String(rec.id ?? ''),
        tenant_id: String(rec.tenant_id ?? ''),
        model: toText(rec.model),
        description: toText(rec.description),
        oem: toText(rec.oem),
        condition: toText(rec.condition),
        category: toText(rec.category),
        qty_available: toNum(rec.qty_available),
        qty_total: toNum(rec.qty_total),
        status: toText(rec.status),
        location: toText(rec.location),
        currency: toText(rec.currency),
        cost: toNum(rec.cost),
        components: [],
        source_count: 1,
        components_mixed: false,
      }
    })

    const systemIds = normalized
      .filter((row) => (row.category ?? '').toLowerCase() !== 'component')
      .map((row) => row.id)
      .filter(Boolean)

    const componentsByParent = new Map<string, ComponentItem[]>()
    if (systemIds.length) {
      const { data: compRows, error: compErr } = await supa
        .from('inventory_items')
        .select('id,model,description,oem,qty_available,currency,specs')
        .in('specs->>parent_id', systemIds)
        .limit(2000)
      if (compErr) throw compErr
      ;(compRows ?? []).forEach((row) => {
        const rec = row as Record<string, unknown>
        const specs = (rec.specs as Record<string, unknown> | null) ?? null
        const parentId = typeof specs?.parent_id === 'string' ? specs.parent_id : ''
        if (!parentId) return
        const comp: ComponentItem = {
          id: String(rec.id ?? ''),
          model: toText(rec.model),
          description: toText(rec.description),
          oem: toText(rec.oem),
          qty_available: toNum(rec.qty_available),
          currency: toText(rec.currency),
        }
        const list = componentsByParent.get(parentId) ?? []
        list.push(comp)
        componentsByParent.set(parentId, list)
      })
    }

    const enriched = normalized.map((row) => ({
      ...row,
      components: (row.category ?? '').toLowerCase() === 'component' ? [] : componentsByParent.get(row.id) ?? [],
    }))

    const mergeText = (a: string | null, b: string | null) => {
      if (!a) return b
      if (!b) return a
      if (a === b) return a
      return 'mixed'
    }
    const mergeNumExact = (a: number | null, b: number | null) => {
      if (a == null) return b
      if (b == null) return a
      return a === b ? a : null
    }
    const componentSignature = (list: ComponentItem[]) =>
      list
        .map((c) => `${(c.model ?? c.description ?? '').trim().toLowerCase()}|${(c.oem ?? '').trim().toLowerCase()}`)
        .sort()
        .join('||')

    const aggregated = new Map<
      string,
      ItemResult & {
        component_signature: string
      }
    >()

    enriched.forEach((row) => {
      const partKey = (row.model ?? row.description ?? '').trim().toLowerCase()
      const groupKey = partKey ? `${row.tenant_id}::${partKey}` : `${row.tenant_id}::${row.id}`
      const signature = componentSignature(row.components)
      const existing = aggregated.get(groupKey)
      if (!existing) {
        aggregated.set(groupKey, {
          ...row,
          qty_available: row.qty_available ?? 0,
          qty_total: row.qty_total ?? 0,
          source_count: 1,
          components_mixed: false,
          component_signature: signature,
        })
        return
      }
      existing.source_count += 1
      existing.qty_available = (existing.qty_available ?? 0) + (row.qty_available ?? 0)
      existing.qty_total = (existing.qty_total ?? 0) + (row.qty_total ?? 0)
      existing.condition = mergeText(existing.condition, row.condition)
      existing.location = mergeText(existing.location, row.location)
      existing.currency = mergeText(existing.currency, row.currency)
      existing.status = mergeText(existing.status, row.status)
      existing.category = mergeText(existing.category, row.category)
      existing.cost = mergeNumExact(existing.cost, row.cost)
      if (existing.component_signature !== signature) {
        existing.components_mixed = true
      }
    })

    const aggregatedList: ItemResult[] = Array.from(aggregated.values()).map(({ component_signature, ...row }) => row)

    const grouped = aggregatedList.reduce<Record<string, Group>>((acc, row) => {
      const sid = String(row.tenant_id)
      if (!acc[sid]) {
        acc[sid] = { supplier_tenant_id: sid, supplier_name: tenantMap.get(sid) ?? 'Supplier', items: [] }
      }
      acc[sid].items.push(row)
      return acc
    }, {})

    return NextResponse.json({ ok: true, results: Object.values(grouped) })
  } catch (e) {
    console.error('buy search error', e)
    const msg = e instanceof Error ? e.message : 'Search failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
