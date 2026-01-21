import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ensureDealThread, generateDealSubjectKey } from '@/lib/deals'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  try {
    const body = await request.json()
    const { buyer_email, subject_template } = body
    if (!buyer_email || !subject_template) {
      return NextResponse.json({ ok: false, message: 'buyer_email and subject_template are required' }, { status: 400 })
    }
    const subjectKey = generateDealSubjectKey()
    const thread = await ensureDealThread(auth.supa, {
      tenant_id: auth.tenantId,
      deal_id: params.id,
      buyer_email: buyer_email.toLowerCase(),
      subject_key: subjectKey,
      subject_template,
      created_by: auth.user.id,
    })
    return NextResponse.json({ ok: true, thread })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}
