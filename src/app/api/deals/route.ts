import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { fetchDealsForTenant, insertDeal } from '@/lib/deals'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  try {
    const deals = await fetchDealsForTenant(auth.supa, auth.tenantId)
    return NextResponse.json({ ok: true, deals })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  try {
    const payload = await request.json()
    const { buyer_id, title, currency, source, status, expected_close_date, stage_notes } = payload
    if (!buyer_id || !title) {
      return NextResponse.json({ ok: false, message: 'buyer_id and title are required' }, { status: 400 })
    }
    const deal = await insertDeal(auth.supa, {
      tenant_id: auth.tenantId,
      buyer_id,
      title,
      status: status ?? 'draft',
      currency: currency ?? 'USD',
      source: source ?? 'mixed',
      created_by: auth.user.id,
      expected_close_date: expected_close_date ?? null,
      stage_notes: stage_notes ?? null,
    })
    return NextResponse.json({ ok: true, deal })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}
