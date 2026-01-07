import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const tenant = process.env.OUTLOOK_TENANT || 'common'
const clientId = process.env.OUTLOOK_CLIENT_ID
const redirectUri = process.env.OUTLOOK_REDIRECT_URI
const scopes = process.env.OUTLOOK_SCOPES || 'openid profile offline_access Mail.Send Mail.Read'

export async function GET() {
  if (!clientId || !redirectUri) {
    return new NextResponse('Outlook client not configured', { status: 500 })
  }

  const state = crypto.randomUUID()
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
