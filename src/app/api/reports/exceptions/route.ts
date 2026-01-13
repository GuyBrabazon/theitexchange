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
    const from = fromParam || startIso(90)
    const to = toParam || new Date().toISOString()

    const { data: profile, error: profileErr } = await supa.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    const tenantId = profile?.tenant_id
    if (!tenantId) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })

    // Awards without PO
    const { data: awards, error: awErr } = await supa
      .from('awarded_lines')
      .select('id,lot_id,buyer_id,created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(10000)
    if (awErr) throw awErr

    const lotIds = Array.from(new Set((awards ?? []).map((a) => a.lot_id).filter(Boolean) as string[]))
    const { data: poLots, error: poErr } = await supa
      .from('purchase_orders')
      .select('lot_id')
      .eq('tenant_id', tenantId)
      .in('lot_id', lotIds.length ? lotIds : [''])
    if (poErr) throw poErr
    const poLotSet = new Set((poLots ?? []).map((p) => String(p.lot_id)))
    const awardsWithoutPo = (awards ?? []).filter((a) => a.lot_id && !poLotSet.has(String(a.lot_id))).slice(0, 200)

    // POs not sent (no status available -> treat as all open)
    const { data: pos, error: posErr } = await supa
      .from('purchase_orders')
      .select('id,created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(1000)
    if (posErr) throw posErr
    const poNotSent = (pos ?? []).map((p) => ({
      id: p.id,
      age_days: Math.max(0, Math.floor((Date.now() - new Date(String(p.created_at)).getTime()) / (1000 * 60 * 60 * 24))),
    }))

    return NextResponse.json({
      ok: true,
      awards_without_po: awardsWithoutPo.map((a) => ({
        id: a.id,
        lot_id: a.lot_id,
        buyer_id: a.buyer_id,
        created_at: a.created_at,
      })),
      po_not_sent: poNotSent,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Report failed' }, { status: 500 })
  }
}
