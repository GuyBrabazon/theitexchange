import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type LotInput = {
  tenant_id: string
  title: string
  currency?: string
  type?: string
  seller_id?: string | null
}

type LineInput = {
  inventory_item_id: string
  qty: number
  asking_price?: number | null
  description?: string | null
}

export async function POST(req: Request) {
  const supa = supabaseServer()
  try {
    const body = (await req.json()) as { lot: LotInput; lines: LineInput[] }
    const { lot, lines } = body
    if (!lot?.tenant_id || !lot.title) {
      return NextResponse.json({ ok: false, message: 'Missing lot tenant_id/title' }, { status: 400 })
    }
    if (!lines?.length) {
      return NextResponse.json({ ok: false, message: 'No lines supplied' }, { status: 400 })
    }

    // Create lot (source = inventory)
    const { data: lotRes, error: lotErr } = await supa
      .from('lots')
      .insert({
        tenant_id: lot.tenant_id,
        title: lot.title,
        currency: lot.currency ?? 'USD',
        type: lot.type ?? 'priced',
        seller_id: lot.seller_id ?? null,
        source: 'inventory',
      })
      .select('id')
      .maybeSingle()
    if (lotErr) throw lotErr
    if (!lotRes?.id) throw new Error('Failed to create lot')
    const lotId: string = lotRes.id

    // Reserve inventory and create line_items
    for (const line of lines) {
      if (!line.inventory_item_id || !line.qty || line.qty <= 0) {
        throw new Error('Invalid line payload')
      }

      // Reserve
      const { error: reserveErr } = await supa.rpc('reserve_inventory_item', {
        p_item: line.inventory_item_id,
        p_qty: line.qty,
        p_tenant: lot.tenant_id,
        p_reason: 'lot reserve',
        p_lot: lotId,
        p_line: null,
      })
      if (reserveErr) throw reserveErr

      // Create line item
      const { error: lineErr } = await supa.from('line_items').insert({
        lot_id: lotId,
        inventory_item_id: line.inventory_item_id,
        qty: line.qty,
        asking_price: line.asking_price ?? null,
        description: line.description ?? null,
      })
      if (lineErr) throw lineErr
    }

    return NextResponse.json({ ok: true, lot_id: lotId })
  } catch (e) {
    console.error('create-from-inventory error', e)
    const msg = e instanceof Error ? e.message : 'Failed to create lot from inventory'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
