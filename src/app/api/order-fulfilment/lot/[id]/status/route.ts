import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type Status = 'sale_in_progress' | 'processing' | 'sold'

function nowIso() {
  return new Date().toISOString()
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: lotId } = await ctx.params
  const sb = supabaseServer()

  // Auth check
  const { data: auth } = await sb.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Resolve tenant from public.users (your current pattern)
  const { data: urow, error: uErr } = await sb
    .from('users')
    .select('id,tenant_id')
    .eq('id', auth.user.id)
    .single()

  if (uErr || !urow?.tenant_id) {
    return NextResponse.json({ error: uErr?.message ?? 'Missing tenant on user' }, { status: 403 })
  }

  const tenantId = urow.tenant_id as string

  let body: { status?: string } | null = null
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const nextStatus = String(body?.status ?? '').toLowerCase() as Status
  if (!['sale_in_progress', 'processing', 'sold'].includes(nextStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Load current lot (guard tenant)
  const { data: lot, error: lotErr } = await sb
    .from('lots')
    .select('id,tenant_id,title,status')
    .eq('id', lotId)
    .eq('tenant_id', tenantId)
    .single()

  if (lotErr || !lot) return NextResponse.json({ error: lotErr?.message ?? 'Lot not found' }, { status: 404 })

  const current = String(lot.status ?? '').toLowerCase()

  // Enforce logical transitions
  const allowed =
    (current === 'sale_in_progress' && nextStatus === 'processing') ||
    (current === 'processing' && nextStatus === 'sold') ||
    // allow re-marking to same value idempotently
    current === nextStatus

  if (!allowed) {
    return NextResponse.json(
      { error: `Invalid transition: ${current || '(none)'} → ${nextStatus}` },
      { status: 400 }
    )
  }

  const patch: Record<string, string> = { status: nextStatus }

  // Timestamp fields: only set if the columns exist in your schema.
  // We avoid selecting schema here; update will error if column doesn't exist.
  // If you already added these columns, great. If not, see SQL below in notes.
  if (nextStatus === 'processing') patch.processing_at = nowIso()
  if (nextStatus === 'sold') patch.sold_at = nowIso()

  // Update lot
  const { error: upErr } = await sb
    .from('lots')
    .update(patch)
    .eq('id', lotId)
    .eq('tenant_id', tenantId)

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Notify (in-app)
  const title =
    nextStatus === 'processing'
      ? 'Lot moved to Processing'
      : nextStatus === 'sold'
      ? 'Lot marked as Sold'
      : 'Lot status updated'

  const bodyText =
    nextStatus === 'processing'
      ? 'Seller/back-office can begin fulfilment (SO, logistics, payment follow-ups).'
      : nextStatus === 'sold'
      ? 'Deal closed. Capture final profit and archive docs.'
      : `Status changed to ${nextStatus}.`

  const { error: nErr } = await sb.from('notifications').insert({
    tenant_id: tenantId,
    lot_id: lotId,
    kind: 'status_change',
    title,
    body: `${lot.title ?? lotId}: ${bodyText}`,
  })

  // Non-fatal: don’t fail the transition if notifications insert fails
  if (nErr) {
    console.warn('notifications insert failed:', nErr.message)
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
