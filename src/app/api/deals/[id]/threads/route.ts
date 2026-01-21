import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ensureDealThread, generateDealSubjectKey } from '@/lib/deals'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { supa, tenantId, user } = auth
  const dealId = params?.id
  if (!dealId) {
    return NextResponse.json({ ok: false, message: 'Deal id missing' }, { status: 400 })
  }

  try {
    const payload = await request.json()
    const buyerEmail = (payload.buyer_email ?? '').trim().toLowerCase()
    const subjectTemplate = payload.subject_template ?? 'Deal conversation'
    if (!buyerEmail) {
      return NextResponse.json({ ok: false, message: 'Buyer email required' }, { status: 400 })
    }
    const subjectKey = payload.subject_key ?? generateDealSubjectKey()
    const thread = await ensureDealThread(supa, {
      tenant_id: tenantId,
      deal_id: dealId,
      buyer_email: buyerEmail,
      subject_key: subjectKey,
      subject_template: subjectTemplate,
      created_by: user.id,
      status: 'active',
    })
    return NextResponse.json({ ok: true, thread })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message ?? 'Unable to create thread' }, { status: 500 })
  }
}
