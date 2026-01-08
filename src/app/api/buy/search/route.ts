import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const term = (url.searchParams.get('term') || '').trim()

    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser()
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
      .select('id,tenant_id,model,description,oem,condition,qty_available,qty_total,status,location,currency,cost')
      .or(`model.ilike.${ilike},description.ilike.${ilike},oem.ilike.${ilike}`)
      .in('status', statuses)
      .neq('tenant_id', profile?.tenant_id ?? '')
      .limit(500)

    if (invErr) throw invErr

    const supplierIds = Array.from(new Set((items ?? []).map((r) => r.tenant_id).filter(Boolean)))
    const { data: tenants, error: tenantErr } = await supa.from('tenants').select('id,name').in('id', supplierIds)
    if (tenantErr) throw tenantErr
    const tenantMap = new Map<string, string>((tenants ?? []).map((t) => [String(t.id), t.name ?? 'Unknown supplier']))

    type ItemRow = NonNullable<typeof items>[number]
    type Group = { supplier_tenant_id: string; supplier_name: string; items: ItemRow[] }

    const grouped = (items ?? []).reduce<Record<string, Group>>((acc, row) => {
      const sid = String(row.tenant_id)
      if (!acc[sid]) {
        acc[sid] = { supplier_tenant_id: sid, supplier_name: tenantMap.get(sid) ?? 'Supplier', items: [] }
      }
      acc[sid].items.push(row as ItemRow)
      return acc
    }, {})

    return NextResponse.json({ ok: true, results: Object.values(grouped) })
  } catch (e) {
    console.error('buy search error', e)
    const msg = e instanceof Error ? e.message : 'Search failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
