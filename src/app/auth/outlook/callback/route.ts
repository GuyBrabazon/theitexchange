import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return new NextResponse(`Outlook auth error: ${error}`, { status: 400 })
  }
  if (!code) {
    return new NextResponse('Missing code', { status: 400 })
  }

  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI
  const tenant = process.env.OUTLOOK_TENANT || 'common'

  if (!clientId || !clientSecret || !redirectUri) {
    return new NextResponse('Outlook client not configured', { status: 500 })
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  try {
    const resp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = await resp.json()
    if (!resp.ok) {
      console.error('Outlook token error', data)
      return new NextResponse(`Token exchange failed: ${data.error || 'unknown error'}`, { status: 500 })
    }

    const expiresIn = data.expires_in
    const gotRefresh = Boolean(data.refresh_token)

    // Persist tokens securely for the current user (identified via Supabase session cookie)
    try {
      const supa = supabaseServer()
      const {
        data: { user },
        error: userErr,
      } = await supa.auth.getUser()
      if (userErr) throw userErr
      if (!user) throw new Error('No authenticated user')

      const expiresAt = new Date(Date.now() + Number(expiresIn || 0) * 1000).toISOString()

      const { error: upsertErr } = await supa.from('outlook_tokens').upsert(
        {
          user_id: user.id,
          access_token: data.access_token,
          refresh_token: data.refresh_token ?? null,
          expires_at: expiresAt,
          scope: data.scope ?? null,
          token_type: data.token_type ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      if (upsertErr) throw upsertErr
    } catch (persistErr) {
      console.error('Failed to persist Outlook tokens', persistErr)
      return new NextResponse('Token saved error', { status: 500 })
    }

    const html = `
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>Outlook connected</h2>
          <p>Access token received. Refresh token: ${gotRefresh ? 'yes' : 'no'}. Expires in ${expiresIn} seconds.</p>
          <p>You can close this window and return to the app.</p>
        </body>
      </html>
    `
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  } catch (e) {
    console.error(e)
    return new NextResponse('Token exchange threw an exception', { status: 500 })
  }
}
