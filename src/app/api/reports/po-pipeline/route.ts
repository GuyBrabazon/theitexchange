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
    const from = fromParam || startIso(30)
    const to = toParam || new Date().toISOString()

    const { data: profile, error: profileErr } = await supa.from('profiles').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    const tenantId = profile?.tenant_id
    if (!tenantId) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    const scopeAll = profile?.role === 'admin' || profile?.role === 'finance'

    const { data: pos, error: poErr } = await supa
      .from('purchase_orders')
      .select('id,created_at')
      .eq('tenant_id', tenantId)
      .eq(scopeAll ? 'tenant_id' : 'created_by', scopeAll ? tenantId : user.id)
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(10000)
    if (poErr) throw poErr

    const total = pos?.length ?? 0
    // Without explicit status, treat all as "received"
    const statusCounts = { draft: 0, sent: 0, open: total, fulfilled: 0 }
    const ageing = (pos ?? []).map((p) => ({
      id: p.id,
      age_days: Math.max(0, Math.floor((Date.now() - new Date(String(p.created_at)).getTime()) / (1000 * 60 * 60 * 24))),
    }))

    return NextResponse.json({
      ok: true,
      summary: {
        pos_total: total,
        pos_sent: statusCounts.sent,
        pos_open: statusCounts.open,
        spend: null, // spend requires normalized po_lines; not available yet
      },
      ageing: ageing.slice(0, 200),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Report failed' }, { status: 500 })
  }
}
