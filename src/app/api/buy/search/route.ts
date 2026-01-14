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

    const enriched: ItemResult[] = normalized.map((row) => ({
      ...row,
      components: (row.category ?? '').toLowerCase() === 'component' ? [] : componentsByParent.get(row.id) ?? [],
    }))

    const grouped = enriched.reduce<Record<string, Group>>((acc, row) => {
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
