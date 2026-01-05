import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type Body = { status?: 'order_processing' | 'sold' }

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() ?? ''
}

async function getTenantFromAuth(sb: ReturnType<typeof supabaseServer>, req: Request) {
  // Prefer Authorization header token (works even when cookies aren't set in dev)
  const bearer = getBearerToken(req)

  const { data: auth, error: authErr } = bearer ? await sb.auth.getUser(bearer) : await sb.auth.getUser()
  const userId = auth?.user?.id ?? null

  if (authErr || !userId) return { userId: null, tenantId: null }

  // Your app uses public.users (not profiles)
  const { data: u, error: uErr } = await sb.from('users').select('id,tenant_id').eq('id', userId).single()
  if (uErr || !u?.tenant_id) return { userId, tenantId: null }

  return { userId, tenantId: u.tenant_id as string }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: lotId } = await ctx.params
  const sb = supabaseServer()

  const { tenantId } = await getTenantFromAuth(sb, req)
  if (!tenantId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    // ignore
  }

  const nextStatus = body.status
  if (!nextStatus || (nextStatus !== 'order_processing' && nextStatus !== 'sold')) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Load lot and verify tenant
  const { data: lot, error: lotErr } = await sb
    .from('lots')
    .select('id,tenant_id,status,po_count,expected_po_count')
    .eq('id', lotId)
    .single()

  if (lotErr || !lot) return NextResponse.json({ error: lotErr?.message ?? 'Lot not found' }, { status: 404 })
  if (lot.tenant_id !== tenantId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const currentStatus = String(lot.status ?? '').toLowerCase()
  const poCount = Number(lot.po_count ?? 0)
  const expected = lot.expected_po_count === null || lot.expected_po_count === undefined ? null : Number(lot.expected_po_count)

  const now = new Date().toISOString()

  if (nextStatus === 'order_processing') {
    if (!expected || expected <= 0) {
      return NextResponse.json({ error: 'Cannot start order processing: no expected POs for this lot.' }, { status: 400 })
    }
    if (poCount < expected) {
      return NextResponse.json(
        { error: `Cannot start order processing: ${poCount}/${expected} POs received.` },
        { status: 400 }
      )
    }

    const patch: Record<string, string | number | null> = { status: 'order_processing', order_processing_at: now }
    const { error: upErr } = await sb.from('lots').update(patch).eq('id', lotId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  // sold
  if (nextStatus === 'sold') {
    if (currentStatus !== 'order_processing') {
      return NextResponse.json({ error: 'You can only mark a lot as Sold from Order Processing.' }, { status: 400 })
    }

    const patch: Record<string, string | number | null> = { status: 'sold', sold_at: now }
    const { error: upErr } = await sb.from('lots').update(patch).eq('id', lotId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unhandled' }, { status: 400 })
}
