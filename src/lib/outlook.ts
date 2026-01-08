import { supabaseServer } from './supabaseServer'

const tokenEndpoint = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

const tenant = process.env.OUTLOOK_TENANT || 'common'
const clientId = process.env.OUTLOOK_CLIENT_ID
const clientSecret = process.env.OUTLOOK_CLIENT_SECRET

async function refreshToken(refresh_token: string) {
  if (!clientId || !clientSecret) throw new Error('Outlook client not configured')
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token,
  })
  const resp = await fetch(tokenEndpoint(tenant), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await resp.json()
  if (!resp.ok) {
    throw new Error(data.error || 'refresh_token_failed')
  }
  return data as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope?: string
    token_type?: string
  }
}

export async function getOutlookTokenForUser(userId: string) {
  const supa = supabaseServer()
  const { data, error } = await supa.from('outlook_tokens').select('*').eq('user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No Outlook token found')

  const now = Date.now()
  const expires = new Date(data.expires_at).getTime() - 60_000 // refresh 1 min early
  if (now < expires) {
    return data
  }

  if (!data.refresh_token) throw new Error('Token expired and no refresh_token')
  const refreshed = await refreshToken(data.refresh_token)
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const { error: upErr, data: updated } = await supa
    .from('outlook_tokens')
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? data.refresh_token,
      expires_at: expiresAt,
      scope: refreshed.scope ?? data.scope,
      token_type: refreshed.token_type ?? data.token_type,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .maybeSingle()
  if (upErr) throw upErr
  return updated ?? { ...data, access_token: refreshed.access_token, refresh_token: refreshed.refresh_token ?? data.refresh_token, expires_at: expiresAt }
}

export async function sendTestMail(userId: string, toEmail: string) {
  const tokenRow = await getOutlookTokenForUser(userId)
  const body = {
    message: {
      subject: 'Test email from The IT Exchange',
      body: {
        contentType: 'Text',
        content: 'This is a test message to confirm Outlook is connected.',
      },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  }

  const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Graph sendMail failed: ${resp.status} ${errText}`)
  }
}

export async function sendOutlookMail(userId: string, toEmail: string, subject: string, htmlBody: string) {
  const tokenRow = await getOutlookTokenForUser(userId)
  const payload = {
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  }

  const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenRow.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Graph sendMail failed: ${resp.status} ${errText}`)
  }
}
