import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { sendTestMail } from '@/lib/outlook'

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

    const email = user.email ?? ''
    if (!email) return NextResponse.json({ ok: false, message: 'User email missing' }, { status: 400 })

    await sendTestMail(user.id, email)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('send-test error', e)
    const msg = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
