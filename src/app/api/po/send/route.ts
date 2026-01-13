import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

type SendPayload = {
  to: string
  subject: string
  body: string
  attachment_name?: string
  attachment_base64?: string
}

export async function POST(req: NextRequest) {
  try {
    const supa = supabaseServer()
    const {
      data: { user },
    } = await supa.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })
    }

    const body: SendPayload = await req.json()
    if (!body.to || !body.subject || !body.body || !body.attachment_base64) {
      return NextResponse.json({ ok: false, message: 'Missing fields' }, { status: 400 })
    }

    // fetch Outlook tokens for this user
    const { data: tokenRow, error: tokenErr } = await supa
      .from('outlook_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle()
    if (tokenErr) throw tokenErr
    const accessToken = tokenRow?.access_token as string | undefined
    if (!accessToken) {
      return NextResponse.json({ ok: false, message: 'Outlook not connected' }, { status: 400 })
    }

    const attachmentName = body.attachment_name || 'purchase-order.pdf'
    const graphPayload = {
      message: {
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
      },
      saveToSentItems: true,
    }

    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphPayload),
    })

    if (!graphRes.ok) {
      const txt = await graphRes.text()
      return NextResponse.json({ ok: false, message: `Graph error: ${graphRes.status} ${txt}` }, { status: graphRes.status })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('send PO via Outlook error', e)
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Send failed' }, { status: 500 })
  }
}
