import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  fetchDealDetail,
  fetchDealLinesForDeal,
  fetchDealThreadsForDeal,
  fetchEmailOffersForDeal,
  updateDealStatus,
} from '@/lib/deals'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { supa } = auth
  const tenantId = auth.tenantId
  const dealId = params?.id
  if (!dealId) {
    return NextResponse.json({ ok: false, message: 'Deal id missing' }, { status: 400 })
  }
  try {
    const deal = await fetchDealDetail(supa, tenantId, dealId)
    if (!deal) {
      return NextResponse.json({ ok: false, message: 'Deal not found' }, { status: 404 })
    }
    const lines = await fetchDealLinesForDeal(supa, tenantId, dealId)
    const threads = await fetchDealThreadsForDeal(supa, tenantId, dealId)
    const offers = await fetchEmailOffersForDeal(supa, tenantId, dealId)
    return NextResponse.json({ ok: true, deal, lines, threads, offers })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: (error as Error).message ?? 'Failed to load deal' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { supa } = auth
  const dealId = params?.id
  if (!dealId) {
    return NextResponse.json({ ok: false, message: 'Deal id missing' }, { status: 400 })
  }
  try {
    const payload = await request.json()
    const updated = await updateDealStatus(supa, dealId, payload.status ?? 'draft')
    if (!updated) {
      return NextResponse.json({ ok: false, message: 'Deal not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, deal: updated })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: (error as Error).message ?? 'Unable to update deal' },
      { status: 500 }
    )
  }
}
