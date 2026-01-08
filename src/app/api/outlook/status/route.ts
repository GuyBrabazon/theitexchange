import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supa = supabaseServer()
    const {
      data: { user },
      error: userErr,
    } = await supa.auth.getUser()
    if (userErr) throw userErr
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data, error } = await supa.from('outlook_tokens').select('expires_at').eq('user_id', user.id).maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ ok: true, connected: false })

    return NextResponse.json({ ok: true, connected: true, expires_at: data.expires_at })
  } catch (e) {
    console.error('status error', e)
    const msg = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
