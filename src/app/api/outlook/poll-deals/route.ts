import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { getOutlookTokenForUser } from '@/lib/outlook'
import { requireAuth } from '@/lib/auth'
import { findOfferTableRows, normalizeLineRef, parseOfferValue, parseQty, normalizeDealSubjectKey } from '@/lib/emailParsing'
import { fetchDealThreads } from '@/lib/deals'

export const runtime = 'nodejs'

const GRAPH_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/messages'
const GRAPH_SELECT = 'id,subject,receivedDateTime,from,body,bodyPreview'
const GRAPH_FILTER = "contains(subject,'DL-')"
const GRAPH_ORDER = 'receivedDateTime desc'
const GRAPH_TOP = '200'

type GraphMessage = {
  id: string
  subject?: string | null
  receivedDateTime?: string | null
  from?: {
    emailAddress?: {
      address?: string | null
      name?: string | null
    } | null
  } | null
  body?: {
    contentType?: string | null
    content?: string | null
  }
  bodyPreview?: string | null
}

async function fetchGraphMessages(accessToken: string) {
  const url = new URL(GRAPH_MESSAGES_URL)
  url.searchParams.set('$select', GRAPH_SELECT)
  url.searchParams.set('$filter', GRAPH_FILTER)
  url.searchParams.set('$orderby', GRAPH_ORDER)
  url.searchParams.set('$top', GRAPH_TOP)
  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.body-content-type="html"',
    },
  })
  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Graph fetch failed (${resp.status}) ${errText}`)
  }
  const data = (await resp.json()) as { value?: GraphMessage[] }
  return Array.isArray(data.value) ? data.value : []
}

type DealParsedOfferRow = {
  lineRefRaw: string
  normalizedLineRef: string
  qty: number | null
  offerAmount: number | null
  offerType: 'per_unit' | 'total_line'
  parseNotes: string[]
  dealLineId: string | null
}

async function insertEmailOffer(
  supa: ReturnType<typeof supabaseServer>,
  payload: {
    tenant_id: string
    deal_id: string
    deal_thread_id: string
    buyer_email: string
    buyer_name: string | null
    message_id: string
    received_at: string
    currency: string
    raw_html: string
    status: string
  }
) {
  return supa
    .from('email_offers')
    .insert([payload])
    .select('id')
    .single()
}

async function insertEmailOfferLines(
  supa: ReturnType<typeof supabaseServer>,
  payload: {
    email_offer_id: string
    line_ref: string
    qty: number | null
    offer_amount: number | null
    offer_type: 'per_unit' | 'total_line'
    parse_notes: string | null
  }[]
) {
  await supa.from('email_offer_lines').insert(payload)
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  const { supa, tenantId, user } = auth
  try {
    const threads = await fetchDealThreads(supa, tenantId)
    if (!threads.length) {
      return NextResponse.json({ ok: true, processed: 0 })
    }
    const threadMap = new Map<string, (typeof threads)[0]>()
    const dealIds = new Set<string>()
    threads.forEach((thread) => {
      threadMap.set(thread.subject_key, thread)
      dealIds.add(thread.deal_id)
    })

    const dealLineMap = new Map<string, Map<string, string>>()
    if (dealIds.size) {
      const { data: lines } = await supa
        .from('deal_lines')
        .select('id,line_ref,deal_id')
        .in('deal_id', Array.from(dealIds))
        .eq('tenant_id', tenantId)
      ;(lines ?? []).forEach((row) => {
        if (!row?.deal_id || !row.line_ref) return
        const normalized = normalizeLineRef(row.line_ref)
        if (!normalized) return
        const map = dealLineMap.get(row.deal_id) ?? new Map()
        map.set(normalized, row.id)
        dealLineMap.set(row.deal_id, map)
      })
    }

    const messages = await fetchGraphMessages((await getOutlookTokenForUser(user.id)).access_token)
    if (!messages.length) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    const messageIds = messages.map((msg) => msg.id).filter(Boolean)
    const { data: existing } = await supa.from('email_offers').select('message_id').in('message_id', messageIds)
    const seen = new Set<string>((existing ?? []).map((entry) => entry.message_id))

    let processedCount = 0
    for (const message of messages) {
      if (!message.id || seen.has(message.id)) continue
      const subjectKey = normalizeDealSubjectKey(message.subject ?? '')
      if (!subjectKey) continue
      const thread = threadMap.get(subjectKey)
      if (!thread) continue

      const html = message.body?.content ?? message.bodyPreview ?? ''
      const rows = findOfferTableRows(html)
      if (!rows.length) {
        continue
      }

      const parsedLines: DealParsedOfferRow[] = []
      let hasIssues = false
      rows.forEach((row) => {
        const normalizedLineRef = normalizeLineRef(row.lineRef)
        const dealLineId = normalizedLineRef ? dealLineMap.get(thread.deal_id)?.get(normalizedLineRef) ?? null : null
        const qty = parseQty(row.qty)
        const offerValue = parseOfferValue(row.offer)
        const notes: string[] = []
        if (!row.lineRef.trim()) {
          notes.push('Missing Line Ref')
        }
        if (!dealLineId) {
          notes.push('Line Ref not recognised')
        }
        if (offerValue.amount == null) {
          notes.push('Offer not parsed')
        }
        if (notes.length) hasIssues = true
        parsedLines.push({
          lineRefRaw: row.lineRef.trim(),
          normalizedLineRef,
          qty,
          offerAmount: offerValue.amount,
          offerType: (offerValue.type ?? 'per_unit') as 'per_unit' | 'total_line',
          parseNotes: notes,
          dealLineId,
        })
      })

      const validAmount = parsedLines.some((line) => line.offerAmount != null)
      if (!validAmount) {
        hasIssues = true
      }

      const currency = await supa
        .from('deals')
        .select('currency')
        .eq('id', thread.deal_id)
        .maybeSingle()
        .then((res) => res.data?.currency ?? 'USD')

      const buyerEmail = message.from?.emailAddress?.address?.toLowerCase() ?? ''
      const buyerName = message.from?.emailAddress?.name ?? null
      const receivedAt = message.receivedDateTime ? new Date(message.receivedDateTime).toISOString() : new Date().toISOString()
      const status = hasIssues ? 'needs_review' : 'parsed'

      const { data: inserted } = await insertEmailOffer(supa, {
        tenant_id: tenantId,
        deal_id: thread.deal_id,
        deal_thread_id: thread.id,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        message_id: message.id,
        received_at: receivedAt,
        currency,
        raw_html: html,
        status,
      })
      if (!inserted?.id) {
        continue
      }
      processedCount += 1

      const linePayload = parsedLines.map((line) => ({
        email_offer_id: inserted.id,
        line_ref: line.lineRefRaw,
        qty: line.qty,
        offer_amount: line.offerAmount,
        offer_type: line.offerType,
        parse_notes: line.parseNotes.length ? line.parseNotes.join('; ') : null,
      }))
      await insertEmailOfferLines(supa, linePayload)
    }

    return NextResponse.json({ ok: true, processed: processedCount })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}
