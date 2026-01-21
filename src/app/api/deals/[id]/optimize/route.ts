import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { supa, tenantId } = auth
  const dealId = params?.id
  if (!dealId) {
    return NextResponse.json({ ok: false, message: 'Deal id missing' }, { status: 400 })
  }

  const payload = await request.json().catch(() => ({}))
  const buyer = (payload.buyer ?? 'manual').toString()
  const note = payload.note ?? `Optimization requested for ${buyer}`

  try {
    const { error } = await supa
      .from('deals')
      .update({
        stage_notes: note,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', dealId)
      .eq('tenant_id', tenantId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message ?? 'Unable to log optimization' }, { status: 500 })
  }
}
