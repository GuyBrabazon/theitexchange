import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

type DraftPayload = {
  to: string
  subject: string
  body: string
  attachment_name?: string
  attachment_base64?: string
}

async function refreshOutlookToken(supa: ReturnType<typeof supabaseServer>, userId: string, refreshToken: string) {
  const tenant = process.env.OUTLOOK_TENANT || 'common'
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Outlook client env vars missing')

  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('grant_type', 'refresh_token')
  params.append('refresh_token', refreshToken)
  params.append('scope', 'https://graph.microsoft.com/.default offline_access')

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Outlook refresh failed: ${res.status} ${txt}`)
  }
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error('No access_token in refresh response')
  const expiresAt = new Date(Date.now() + ((json.expires_in ?? 3600) - 60) * 1000).toISOString()

  const { error: upErr } = await supa
    .from('outlook_tokens')
    .update({
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (upErr) throw upErr

  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? refreshToken }
}

export async function POST(req: NextRequest) {
  try {
    const supa = supabaseServer()
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace(/Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const { data: userResp, error: userErr } = await supa.auth.getUser(token)
    if (userErr) return NextResponse.json({ ok: false, message: userErr.message }, { status: 401 })
    const user = userResp?.user
    if (!user) return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })

    const body: DraftPayload = await req.json()
    if (!body.to || !body.subject || !body.body || !body.attachment_base64) {
      return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 })
    }

    const { data: tokenRow, error: tokenErr } = await supa
      .from('outlook_tokens')
      .select('access_token,refresh_token,expires_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (tokenErr) throw tokenErr
    let accessToken = tokenRow?.access_token as string | undefined
    const refreshToken = tokenRow?.refresh_token as string | undefined
    const expiresAt = tokenRow?.expires_at as string | undefined
    if (!accessToken) return NextResponse.json({ ok: false, message: 'Outlook not connected' }, { status: 400 })

    const needsRefresh = expiresAt ? new Date(expiresAt).getTime() < Date.now() + 60 * 1000 : false
    if (needsRefresh && refreshToken) {
      const refreshed = await refreshOutlookToken(supa, user.id, refreshToken)
      accessToken = refreshed.accessToken
    }

    const attachmentName = body.attachment_name || 'purchase-order.pdf'
    const graphPayload = {
      subject: body.subject,
      body: {
        contentType: 'Text',
        content: body.body,
      },
      toRecipients: [{ emailAddress: { address: body.to } }],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachmentName,
          contentBytes: body.attachment_base64,
        },
      ],
    }

    const createDraft = async (tokenToUse: string) =>
      fetch('https://graph.microsoft.com/v1.0/me/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphPayload),
      })

    let graphRes = await createDraft(accessToken)
    if (graphRes.status === 401 && refreshToken) {
      const refreshed = await refreshOutlookToken(supa, user.id, refreshToken)
      graphRes = await createDraft(refreshed.accessToken)
    }
    if (graphRes.status === 503 || graphRes.status === 502) {
      await new Promise((r) => setTimeout(r, 800))
      graphRes = await createDraft(accessToken)
    }

    if (!graphRes.ok) {
      const txt = await graphRes.text()
      return NextResponse.json({ ok: false, message: `Graph error: ${graphRes.status} ${txt}` }, { status: graphRes.status })
    }

    return NextResponse.json({ ok: true, drafts_url: 'https://outlook.office.com/mail/drafts' })
  } catch (e) {
    console.error('create PO draft via Outlook error', e)
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Draft failed' }, { status: 500 })
  }
}
