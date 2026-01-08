import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser()
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { error } = await supa.from('outlook_tokens').delete().eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('disconnect error', e)
    const msg = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
