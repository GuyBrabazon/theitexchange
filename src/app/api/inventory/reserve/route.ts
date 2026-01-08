import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type ReserveItem = {
  inventory_item_id: string
  qty: number
  tenant_id: string
  lot_id?: string
  line_item_id?: string
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as { items?: ReserveItem[] }
    const items = payload.items || []
    if (!items.length) return NextResponse.json({ ok: false, message: 'No items provided' }, { status: 400 })

    const supa = supabaseServer()

    for (const item of items) {
      if (!item.tenant_id || !item.inventory_item_id || !item.qty || item.qty <= 0) {
        return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 })
      }

      const { error } = await supa.rpc('reserve_inventory_item', {
        p_item: item.inventory_item_id,
        p_qty: item.qty,
        p_tenant: item.tenant_id,
        p_reason: 'lot reserve',
        p_lot: item.lot_id ?? null,
        p_line: item.line_item_id ?? null,
      })
      if (error) {
        console.error('reserve_inventory_item failed', error)
        return NextResponse.json({ ok: false, message: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    const msg = e instanceof Error ? e.message : 'Failed to reserve'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
