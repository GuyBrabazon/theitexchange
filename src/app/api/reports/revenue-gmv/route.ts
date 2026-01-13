import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type PeriodMap = Record<string, { awarded: number; offers: number }>

function startIso(daysBack: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysBack)
  return d.toISOString()
}

function bucket(period: 'day' | 'week' | 'month', date: string) {
  const d = new Date(date)
  if (period === 'day') return d.toISOString().slice(0, 10)
  if (period === 'week') {
    const first = new Date(d)
    const day = d.getUTCDay()
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
    first.setUTCDate(diff)
    return first.toISOString().slice(0, 10)
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
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

    const groupBy = (url.searchParams.get('groupBy') as 'day' | 'week' | 'month') || 'month'
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const from = fromParam || startIso(30)
    const to = toParam || new Date().toISOString()

    const { data: profile, error: profileErr } = await supa.from('profiles').select('tenant_id,role').eq('id', user.id).maybeSingle()
    if (profileErr) throw profileErr
    const tenantId = profile?.tenant_id
    if (!tenantId) return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    const scopeAll = profile?.role === 'admin' || profile?.role === 'finance'

    const { data: awards, error: awErr } = await supa
      .from('awarded_lines')
      .select('extended,currency,created_at,lot_id')
      .eq('tenant_id', tenantId)
      .eq(scopeAll ? 'tenant_id' : 'created_by', scopeAll ? tenantId : user.id)
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(20000)
    if (awErr) throw awErr

    const lotIds = Array.from(new Set((awards ?? []).map((a) => a.lot_id).filter(Boolean) as string[]))
    const { data: lots, error: lotErr } = await supa.from('lots').select('id,created_at').in('id', lotIds.length ? lotIds : ['']).limit(20000)
    if (lotErr) throw lotErr
    const lotMap = new Map<string, string>((lots ?? []).map((l) => [String(l.id), String(l.created_at)]))

    const { data: offers, error: offErr } = await supa
      .from('offers')
      .select('total_offer,currency,created_at,lot_id')
      .eq('tenant_id', tenantId)
      .eq(scopeAll ? 'tenant_id' : 'created_by', scopeAll ? tenantId : user.id)
      .gte('created_at', from)
      .lte('created_at', to)
      .limit(20000)
    if (offErr) throw offErr

    const periods: PeriodMap = {}
    let awardedSum = 0
    let offersSum = 0

    for (const a of awards ?? []) {
      const v = Number(a.extended ?? 0)
      awardedSum += isFinite(v) ? v : 0
      const p = bucket(groupBy, String(a.created_at))
      if (!periods[p]) periods[p] = { awarded: 0, offers: 0 }
      periods[p].awarded += isFinite(v) ? v : 0
    }
    for (const o of offers ?? []) {
      const v = Number(o.total_offer ?? 0)
      offersSum += isFinite(v) ? v : 0
      const p = bucket(groupBy, String(o.created_at))
      if (!periods[p]) periods[p] = { awarded: 0, offers: 0 }
      periods[p].offers += isFinite(v) ? v : 0
    }

    // Award velocity
    const velocities: number[] = []
    for (const a of awards ?? []) {
      const lotCreated = a.lot_id ? lotMap.get(String(a.lot_id)) : null
      if (!lotCreated) continue
      const d1 = new Date(lotCreated).getTime()
      const d2 = new Date(String(a.created_at)).getTime()
      if (!isFinite(d1) || !isFinite(d2)) continue
      velocities.push((d2 - d1) / (1000 * 60 * 60 * 24))
    }
    const awardVelocity = velocities.length
      ? velocities.sort((a, b) => a - b)[Math.floor(velocities.length / 2)]
      : null

    const series = Object.entries(periods)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([period, vals]) => ({ period, awarded: vals.awarded, offers: vals.offers }))

    return NextResponse.json({
      ok: true,
      summary: {
        awarded_gmv: awardedSum,
        offer_gmv: offersSum,
        lots_awarded: lotIds.length,
        award_velocity_days: awardVelocity,
      },
      series,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Report failed' }, { status: 500 })
  }
}
