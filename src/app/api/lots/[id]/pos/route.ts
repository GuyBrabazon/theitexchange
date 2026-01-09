import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const sb = supabaseServer()

  // Load lot basic info
  const { data: lot, error: lotErr } = await sb.from('lots').select('id,tenant_id,title,status,currency').eq('id', id).maybeSingle()
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 })
  if (!lot) return NextResponse.json({ error: 'Lot not found' }, { status: 404 })

  // Load POs
  const { data: pos, error: poErr } = await sb
    .from('purchase_orders')
    .select(
      'id,tenant_id,lot_id,buyer_id,invite_id,token,file_name,file_path,content_type,notes,created_at,po_number,pdf_path'
    )
    .eq('lot_id', id)
    .order('created_at', { ascending: false })

  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 })

  const rows = Array.isArray(pos) ? pos : []
  const signedRows = []
  for (const row of rows) {
    let signed_url: string | null = null
    if (row.file_path) {
      const { data: signed, error: signErr } = await sb.storage.from('pos').createSignedUrl(row.file_path, 3600)
      if (!signErr && signed?.signedUrl) signed_url = signed.signedUrl
    }
    signedRows.push({ ...row, signed_url })
  }

  return NextResponse.json({ lot, purchase_orders: signedRows })
}
