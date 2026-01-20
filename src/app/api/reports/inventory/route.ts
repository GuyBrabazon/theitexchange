import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

function startIso(daysBack: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysBack)
  return d.toISOString()
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const supa = supabaseServer()
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace(/Bearer\s+/i, '')
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const from = fromParam || startIso(365) // for ageing
    const to = toParam || new Date().toISOString()

    const { data: profile, error: profileErr } = await supa.from('profiles').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    const tenantId = profile?.tenant_id
    if (!tenantId) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    const scopeAll = profile?.role === 'admin' || profile?.role === 'finance'

    const { data: items, error: invErr } = await supa
      .from('inventory_items')
      .select('id,model,description,oem,cost,qty_available,created_at')
      .eq('tenant_id', tenantId)
      .eq(scopeAll ? 'tenant_id' : 'created_by', scopeAll ? tenantId : user.id)
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(20000)
    if (invErr) throw invErr

    let totalValue = 0
    let totalQty = 0
    const ageingBuckets = { '0-30': 0, '31-90': 0, '91-180': 0, '180+': 0 }
    const now = Date.now()

    for (const it of items ?? []) {
      const qty = Number(it.qty_available ?? 0)
      const unitCost = Number(it.cost ?? 0)
      if (isFinite(qty) && isFinite(unitCost)) {
        totalQty += qty
        totalValue += qty * unitCost
      }
      const ageDays = Math.max(0, Math.floor((now - new Date(String(it.created_at)).getTime()) / (1000 * 60 * 60 * 24)))
      if (ageDays <= 30) ageingBuckets['0-30'] += qty
      else if (ageDays <= 90) ageingBuckets['31-90'] += qty
      else if (ageDays <= 180) ageingBuckets['91-180'] += qty
      else ageingBuckets['180+'] += qty
    }

    const top = (items ?? [])
      .map((it) => {
        const qty = Number(it.qty_available ?? 0)
        const cost = Number(it.cost ?? 0)
        return {
          id: it.id,
          model: it.model,
          description: it.description,
          oem: it.oem,
          qty,
          cost,
          value: isFinite(qty) && isFinite(cost) ? qty * cost : 0,
        }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 50)

    return NextResponse.json({
      ok: true,
      summary: {
        total_value: totalValue,
        total_qty: totalQty,
      },
      ageing: ageingBuckets,
      top,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Report failed' }, { status: 500 })
  }
}
