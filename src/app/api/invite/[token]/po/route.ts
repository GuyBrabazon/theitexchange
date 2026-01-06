import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

function safeName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, '_')
}

export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const sb = supabaseServer()

  const { data: inv, error: invErr } = await sb
    .from('lot_invites')
    .select('id,token,tenant_id,lot_id,buyer_id,round_id')
    .eq('token', token)
    .single()

  if (invErr || !inv) {
    return NextResponse.json({ error: invErr?.message ?? 'Invite not found' }, { status: 404 })
  }

  const { data, error } = await sb
    .from('purchase_orders')
    .select('id,file_name,file_path,content_type,created_at,notes')
    .eq('invite_id', inv.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ purchase_orders: data ?? [] })
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const sb = supabaseServer()

  const { data: inv, error: invErr } = await sb
    .from('lot_invites')
    .select('id,token,status,tenant_id,lot_id,buyer_id,round_id')
    .eq('token', token)
    .single()

  if (invErr || !inv) {
    return NextResponse.json({ error: invErr?.message ?? 'Invite not found' }, { status: 404 })
  }

  // Optional gating: only allow PO upload if invite is active
  // if (inv.status !== 'active') return NextResponse.json({ error: 'Invite not active' }, { status: 403 })

  // Only winners can upload POs (any round)
  const { count, error: cErr } = await sb
    .from('awarded_lines')
    .select('id', { count: 'exact', head: true })
    .eq('lot_id', inv.lot_id)
    .eq('buyer_id', inv.buyer_id)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'PO upload is only available for winning buyers.' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const notes = (form.get('notes') as string | null) ?? null

  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 400 })

  const fileName = safeName(file.name || 'po.pdf')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const path = `${inv.tenant_id}/${inv.lot_id}/${inv.buyer_id}/${ts}-${fileName}`

  // Upload to Storage (private bucket)
  const { error: upErr } = await sb.storage.from('pos').upload(path, file, {
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // 1) Record metadata (existing table you already use in UI)
  const { error: insErr } = await sb.from('purchase_orders').insert({
    tenant_id: inv.tenant_id,
    lot_id: inv.lot_id,
    buyer_id: inv.buyer_id,
    invite_id: inv.id,
    token: inv.token,
    file_path: path,
    file_name: fileName,
    content_type: file.type || null,
    notes,
  })

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // 2) Record in po_uploads for per-round / per-lot metrics (new table)
  // round_id comes from the invite, which ties the buyer action to the correct round.
  // If round_id is null (older invites), we still store the upload for the lot.
  const { error: puErr } = await sb.from('po_uploads').insert({
    tenant_id: inv.tenant_id,
    lot_id: inv.lot_id,
    round_id: inv.round_id ?? null,
    buyer_id: inv.buyer_id,
    invite_id: inv.id,
    file_path: path,
    file_name: fileName,
    notes,
  })

  if (puErr) return NextResponse.json({ error: puErr.message }, { status: 500 })

  // --- Lot status + PO counters ---
  // Recompute po_count from purchase_orders to avoid double counting on retries.
  const nowIso = new Date().toISOString()

  const { count: poCount, error: poCountErr } = await sb
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('lot_id', inv.lot_id)

  if (poCountErr) return NextResponse.json({ error: poCountErr.message }, { status: 500 })

  const { data: lotRow, error: lotErr } = await sb
    .from('lots')
    .select('id,status')
    .eq('id', inv.lot_id)
    .single()

  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 })

  const currentStatus = String(lotRow?.status ?? '')

  const patch: Record<string, string | number | null> = {
    po_count: Number(poCount ?? 0),
    last_po_at: nowIso,
  }

  if (currentStatus !== 'closed') {
    if (currentStatus !== 'sale_in_progress') {
      patch.status = 'sale_in_progress'
      patch.sale_in_progress_at = nowIso
    }
  }

  const { error: lotUpErr } = await sb.from('lots').update(patch).eq('id', inv.lot_id)
  if (lotUpErr) return NextResponse.json({ error: lotUpErr.message }, { status: 500 })

  // Redirect back to the invite page with a success flag so the browser doesn't "pretty-print" JSON
  const redirectUrl = new URL(`/invite/${token}?po=success`, req.url)
  return NextResponse.redirect(redirectUrl, { status: 303 })
}
