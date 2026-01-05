import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const sb = supabaseServer()

  // 1) Validate invite
  const { data: inv, error: invErr } = await sb
    .from('lot_invites')
    .select('id,token,tenant_id,lot_id,buyer_id,round_id,status,created_at')
    .eq('token', token)
    .single()

  if (invErr || !inv) return NextResponse.json({ error: invErr?.message ?? 'Invite not found' }, { status: 404 })

  // 2) Load lot + seller (optional)
  const { data: lot, error: lotErr } = await sb
    .from('lots')
    .select('id,title,status,currency,type,created_at')
    .eq('id', inv.lot_id)
    .single()

  if (lotErr || !lot) return NextResponse.json({ error: lotErr?.message ?? 'Lot not found' }, { status: 404 })

  // 3) Load line items (buyer-visible fields)
  // NOTE: You can add/remove columns here freely; it’s only used by the invite UI.
  const { data: items, error: itemsErr } = await sb
    .from('line_items')
    .select(
      `
      id,lot_id,model,description,qty,asking_price,
      serial_tag,cpu,cpu_qty,memory_part_numbers,memory_qty,
      network_card,expansion_card,gpu,
      specs
    `
    )
    .eq('lot_id', inv.lot_id)
    .order('id', { ascending: false })
    .limit(5000)

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 })

  return NextResponse.json({
    invite: {
      id: inv.id,
      token: inv.token,
      lot_id: inv.lot_id,
      buyer_id: inv.buyer_id,
      round_id: inv.round_id ?? null,
      status: inv.status ?? null,
    },
    lot: {
      id: lot.id,
      title: lot.title ?? null,
      status: lot.status ?? null,
      currency: lot.currency ?? null,
      type: lot.type ?? null,
      created_at: lot.created_at ?? null,
    },
    line_items: items ?? [],
  })
}
