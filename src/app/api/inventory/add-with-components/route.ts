import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export async function POST(req: NextRequest) {
  const supa = supabaseServer()
  try {
    const body = await req.json()
    const tenantId: string | undefined = body?.tenant_id
    const item = body?.item || {}
    const components: Array<{ model?: string; oem?: string; qty?: number }> = body?.components || []

    if (!tenantId) {
      return NextResponse.json({ ok: false, message: 'tenant_id is required' }, { status: 400 })
    }

    const parentPayload = {
      tenant_id: tenantId,
      model: item.model || null,
      description: item.description || item.model || null,
      oem: item.oem || null,
      condition: item.condition || null,
      location: item.location || null,
      category: item.category || 'server',
      status: item.status || 'available',
      qty_available: item.qty_available ?? null,
      qty_total: null,
      cost: item.cost ?? null,
      currency: item.currency || 'USD',
      specs: item.specs || {},
    }

    const { data: parentRow, error: parentErr } = await supa.from('inventory_items').insert(parentPayload).select('id').single()
    if (parentErr || !parentRow?.id) throw parentErr || new Error('Failed to create system')
    const parentId = parentRow.id as string

    // Add contained components as separate inventory items, linked via specs.parent_id
    const compPayloads = components
      .map((c) => ({
        tenant_id: tenantId,
        model: c.model || null,
        description: c.model || null,
        oem: c.oem || null,
        category: 'component',
        status: 'available',
        qty_available: typeof c.qty === 'number' && Number.isFinite(c.qty) ? c.qty : null,
        qty_total: null,
        cost: null,
        currency: item.currency || 'USD',
        specs: { parent_id: parentId },
      }))
      .filter((c) => c.model || c.oem)

    let compRows: { id: string }[] = []
    if (compPayloads.length) {
      const { data: comps, error: compErr } = await supa.from('inventory_items').insert(compPayloads).select('id')
      if (compErr) throw compErr
      compRows = comps ?? []
    }

    // Movement audit
    const movements: Array<{
      inventory_item_id: string
      tenant_id: string
      change_type: string
      qty_delta: number
      reason: string
    }> = []

    if (item.qty_available) {
      movements.push({
        inventory_item_id: parentId,
        tenant_id: tenantId,
        change_type: 'add',
        qty_delta: Number(item.qty_available) || 0,
        reason: 'manual add with components',
      })
    }

    compRows.forEach((r, idx) => {
      const qty = compPayloads[idx]?.qty_available ?? 0
      if (qty) {
        movements.push({
          inventory_item_id: r.id,
          tenant_id: tenantId,
          change_type: 'add',
          qty_delta: Number(qty) || 0,
          reason: 'component added to system',
        })
      }
    })

    if (movements.length) {
      await supa.from('inventory_movements').insert(movements)
    }

    return NextResponse.json({ ok: true, id: parentId })
  } catch (e: any) {
    console.error(e)
    const msg = e?.message || 'Failed to add inventory with components'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
