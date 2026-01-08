import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const tenant = process.env.OUTLOOK_TENANT || 'common'
const clientId = process.env.OUTLOOK_CLIENT_ID
const redirectUri = process.env.OUTLOOK_REDIRECT_URI
const scopes = process.env.OUTLOOK_SCOPES || 'openid profile offline_access Mail.Send Mail.Read'

export async function GET(req: Request) {
  if (!clientId || !redirectUri) {
    return new NextResponse('Outlook client not configured', { status: 500 })
  }

  const urlIn = new URL(req.url)
  const uid = urlIn.searchParams.get('uid')
  if (!uid) {
    return new NextResponse('Missing user id for Outlook connect', { status: 400 })
  }

  // Use user id as state so callback can persist tokens without relying on session cookies
  const state = uid
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: scopes,
    state,
  })

  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`
  return NextResponse.redirect(url)
}
