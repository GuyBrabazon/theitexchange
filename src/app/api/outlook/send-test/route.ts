import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { sendTestMail } from '@/lib/outlook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const supa = supabaseServer()
    const url = new URL(req.url)
    const uid = url.searchParams.get('uid')
    let userId = uid ?? ''
    let email = ''

    if (!userId) {
      const {
        data: { user },
        error: userErr,
      } = await supa.auth.getUser()
      if (userErr) throw userErr
      if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })
      userId = user.id
      email = user.email ?? ''
    } else {
      const { data: userRow, error } = await supa.from('users').select('id').eq('id', userId).maybeSingle()
      if (error) throw error
      if (!userRow) return NextResponse.json({ ok: false, message: 'User not found' }, { status: 404 })
    }

    if (!email) {
      // fetch auth email if not already set (service role can read auth.users)
      const { data: authUser, error: authErr } = await supa.auth.admin.getUserById(userId)
      if (authErr) throw authErr
      email = authUser?.user?.email ?? ''
    }
    if (!email) return NextResponse.json({ ok: false, message: 'User email missing' }, { status: 400 })

    await sendTestMail(userId, email)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    console.error('send-test error', e)
    const msg = e instanceof Error ? e.message : 'Failed'
    return NextResponse.json({ ok: false, message: msg }, { status: 500 })
  }
}
