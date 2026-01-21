import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { getOutlookTokenForUser } from '@/lib/outlook'

export const runtime = 'nodejs'

const GRAPH_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/messages'
const GRAPH_SELECT = 'id,subject,receivedDateTime,from,body,bodyPreview'
const GRAPH_FILTER = "contains(subject,'LOT-')"
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

type LotBatch = {
  id: string
  lot_id: string
  batch_key: string
  currency: string | null
  status: string | null
}

type ParsedOfferRow = {
  lineRefRaw: string
  normalizedLineRef: string
  qty: number | null
  offerAmount: number | null
  offerType: 'per_unit' | 'total_line'
  parseNotes: string[]
  lineItemId: string | null
}

async function resolveToken(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
  if (bearer) return bearer
  const cookieStore = await cookies()
  return cookieStore.get('sb-access-token')?.value ?? ''
}

function stripHtml(value: string) {
  return value.replace(/<\/?[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
}

function extractCells(rowHtml: string) {
  const cells: string[] = []
  const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi
  let match
  while ((match = cellRegex.exec(rowHtml))) {
    cells.push(stripHtml(match[1]))
  }
  return cells
}

function extractRows(tableHtml: string) {
  const rows: string[] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let match
  while ((match = rowRegex.exec(tableHtml))) {
    rows.push(match[1])
  }
  return rows
}

function findOfferTableRows(html: string) {
  if (!html) return []
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
  let tableMatch
  while ((tableMatch = tableRegex.exec(html))) {
    const tableContent = tableMatch[1]
    const rows = extractRows(tableContent)
    if (!rows.length) continue
    const headerCells = extractCells(rows[0])
    const normalized = headerCells.map((cell) => cell.toLowerCase().trim())
    const lineRefIdx = normalized.findIndex((text) => text.includes('line ref'))
    const offerIdx = normalized.findIndex((text) => text.includes('offer'))
    if (lineRefIdx < 0 || offerIdx < 0) continue
    const qtyIdx = normalized.findIndex((text) => text.includes('qty'))
    const parsed: OfferRow[] = []
    for (let i = 1; i < rows.length; i += 1) {
      const cells = extractCells(rows[i])
      parsed.push({
        lineRef: cells[lineRefIdx] ?? '',
        qty: qtyIdx >= 0 ? cells[qtyIdx] ?? '' : '',
        offer: cells[offerIdx] ?? '',
      })
    }
    if (parsed.length) {
      return parsed
    }
  }
  return []
}

type OfferRow = {
  lineRef: string
  qty: string
  offer: string
}

function parseQty(value: string | null | undefined) {
  if (!value) return null
  const cleaned = value.replace(/[^\d.-]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return null
  return Math.round(num)
}

function parseOfferValue(value: string | null | undefined) {
  if (!value) return { amount: null, type: 'per_unit' as const }
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed || trimmed === '&nbsp;') return { amount: null, type: 'per_unit' as const }
  const lower = trimmed.toLowerCase()
  let type: 'per_unit' | 'total_line' = 'per_unit'
  let candidate = trimmed
  if (lower.startsWith('total:')) {
    type = 'total_line'
    candidate = trimmed.slice(trimmed.indexOf(':') + 1)
  } else if (lower.startsWith('total ')) {
    type = 'total_line'
    candidate = trimmed.slice(5)
  }
  const cleaned = candidate.replace(/[^\d.-]/g, '')
  if (!cleaned) return { amount: null, type }
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return { amount: null, type }
  return { amount: num, type }
}

function normalizeLineRef(value: string) {
  return value.replace(/[^A-Z0-9]/gi, '').toUpperCase()
}

function matchBatch(subject: string | null, batchKeys: string[], bundle: Map<string, LotBatch>) {
  if (!subject) return null
  const upper = subject.toUpperCase()
  for (const key of batchKeys) {
    if (upper.includes(key.toUpperCase())) {
      return bundle.get(key) ?? null
    }
  }
  return null
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

export async function POST(request: Request) {
  try {
    const token = await resolveToken(request)
    if (!token) {
      return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })
    }

    const supa = supabaseServer()
    const { data: userData, error: userErr } = await supa.auth.getUser(token)
    if (userErr) throw userErr
    const user = userData?.user
    if (!user) {
      return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 })
    }

    const [
      { data: profile, error: profileErr },
      { data: userRow, error: userErr },
    ] = await Promise.all([
      supa.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle(),
      supa.from('users').select('tenant_id').eq('id', user.id).maybeSingle(),
    ])
    if (profileErr) throw profileErr
    if (userErr) throw userErr
    const tenantId = profile?.tenant_id ?? userRow?.tenant_id
    if (!tenantId) {
      return NextResponse.json({ ok: false, message: 'Tenant not found' }, { status: 400 })
    }

    const { data: batches } = await supa
      .from('lot_email_batches')
      .select('id,lot_id,batch_key,currency,status')
      .eq('tenant_id', tenantId)
      .eq('created_by', user.id)
      .eq('status', 'sent')
    if (!batches || !batches.length) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    const batchMap = new Map<string, LotBatch>()
    batches.forEach((batch) => {
      if (batch.batch_key) {
        batchMap.set(batch.batch_key, batch)
      }
    })
    if (!batchMap.size) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    const lotIds = Array.from(new Set(batches.map((b) => b.lot_id)))
    const lotCurrencyMap = new Map<string, string | null>()
    if (lotIds.length) {
      const { data: lotRows } = await supa.from('lots').select('id,currency').in('id', lotIds)
      ;(lotRows ?? []).forEach((lot) => {
        if (lot && lot.id) lotCurrencyMap.set(lot.id, lot.currency ?? null)
      })
    }

    const lotLineMap = new Map<string, Map<string, string>>()
    if (lotIds.length) {
      const { data: lineRows } = await supa
        .from('line_items')
        .select('id,line_ref,lot_id')
        .in('lot_id', lotIds)
        .eq('tenant_id', tenantId)
      ;(lineRows ?? []).forEach((row) => {
        if (!row?.lot_id || !row.line_ref) return
        const normalized = normalizeLineRef(row.line_ref)
        if (!normalized) return
        const map = lotLineMap.get(row.lot_id) ?? new Map()
        map.set(normalized, row.id)
        lotLineMap.set(row.lot_id, map)
      })
    }

    const outlookToken = await getOutlookTokenForUser(user.id)
    const messages = await fetchGraphMessages(outlookToken.access_token)
    if (!messages.length) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    const messageIds = messages.map((msg) => msg.id).filter(Boolean)
    const { data: existing } = await supa.from('email_offers').select('message_id').in('message_id', messageIds)
    const seen = new Set<string>((existing ?? []).map((row) => row.message_id))

    const batchKeys = Array.from(batchMap.keys())
    let processedCount = 0
    for (const message of messages) {
      if (!message.id || seen.has(message.id)) continue
      const batch = matchBatch(message.subject ?? '', batchKeys, batchMap)
      if (!batch) continue

      const html = message.body?.content ?? message.bodyPreview ?? ''
      const rows = findOfferTableRows(html)
      if (!rows.length) {
        continue
      }

      const parsedLines: ParsedOfferRow[] = []
      let hasIssues = false
      rows.forEach((row) => {
        const normalizedLineRef = normalizeLineRef(row.lineRef)
        const lineItemId = normalizedLineRef ? lotLineMap.get(batch.lot_id)?.get(normalizedLineRef) ?? null : null
        const qty = parseQty(row.qty)
        const offerValue = parseOfferValue(row.offer)
        const notes: string[] = []
        if (!row.lineRef.trim()) {
          notes.push('Missing Line Ref')
        }
        if (!lineItemId) {
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
          offerType: offerValue.type,
          parseNotes: notes,
          lineItemId,
        })
      })

      const validAmount = parsedLines.some((line) => line.offerAmount != null)
      if (!validAmount) {
        hasIssues = true
      }

      const currency = batch.currency ?? lotCurrencyMap.get(batch.lot_id) ?? 'USD'
      const buyerEmail = message.from?.emailAddress?.address?.toLowerCase() ?? ''
      const buyerName = message.from?.emailAddress?.name ?? null
      const receivedAt = message.receivedDateTime ? new Date(message.receivedDateTime).toISOString() : new Date().toISOString()
      const status = hasIssues ? 'needs_review' : 'parsed'

      const { data: offerData, error: offerErr } = await supa
        .from('email_offers')
        .insert([
          {
            tenant_id: tenantId,
            lot_id: batch.lot_id,
            batch_id: batch.id,
            buyer_email: buyerEmail,
            buyer_name: buyerName,
            message_id: message.id,
            received_at: receivedAt,
            currency,
            raw_html: html,
            status,
          },
        ])
        .select('id')
      if (offerErr || !offerData?.length) continue
      const emailOfferId = offerData[0].id

      const linePayload = parsedLines.map((line) => ({
        email_offer_id: emailOfferId,
        line_ref: line.lineRefRaw,
        qty: line.qty,
        offer_amount: line.offerAmount,
        offer_type: line.offerType,
        parse_notes: line.parseNotes.length ? line.parseNotes.join('; ') : null,
      }))
      await supa.from('email_offer_lines').insert(linePayload)

      const buyerMatch = buyerEmail
        ? await supa.from('buyers').select('id').ilike('email', buyerEmail).maybeSingle()
        : { data: null }
      const buyerId = buyerMatch?.data?.id ?? null

      const totalOffer = parsedLines.reduce((sum, line) => {
        if (line.offerAmount == null) return sum
        if (line.offerType === 'per_unit' && line.qty != null) {
          return sum + line.offerAmount * line.qty
        }
        if (line.offerType === 'total_line') {
          return sum + line.offerAmount
        }
        return sum
      }, 0)

      const lineOfferPayload = parsedLines
        .map((line) => {
          if (!line.lineItemId || line.offerAmount == null) return null
          const unitPrice =
            line.offerType === 'per_unit'
              ? line.offerAmount
              : line.qty && line.qty > 0
              ? line.offerAmount / line.qty
              : null
          if (unitPrice == null || !Number.isFinite(unitPrice)) return null
          return {
            lot_id: batch.lot_id,
            buyer_id: buyerId,
            line_item_id: line.lineItemId,
            unit_price: unitPrice,
            qty: line.qty ?? 1,
            currency,
          }
        })
        .filter((entry): entry is { lot_id: string; buyer_id: string | null; line_item_id: string; unit_price: number; qty: number; currency: string } => !!entry)

      if (lineOfferPayload.length && totalOffer > 0) {
        const baseOffer = {
          lot_id: batch.lot_id,
          tenant_id: tenantId,
          buyer_id: buyerId,
          currency,
          created_by: user.id,
          take_all_total: totalOffer,
          total_offer: totalOffer,
          notes: `Email offer (${buyerEmail}) message_id=${message.id} batch=${batch.batch_key}`,
          status: 'submitted',
        }
        let offerRowId: string | null = null
        const attempt = await supa.from('offers').insert(baseOffer).select('id').single()
        if (!attempt.error && attempt.data?.id) {
          offerRowId = attempt.data.id
        } else {
          const retry = await supa.from('offers').insert({ ...baseOffer, status: null }).select('id').single()
          if (!retry.error && retry.data?.id) {
            offerRowId = retry.data.id
          }
        }
        if (offerRowId) {
          const offerLines = lineOfferPayload.map((line) => ({
            offer_id: offerRowId,
            lot_id: line.lot_id,
            buyer_id: line.buyer_id,
            line_item_id: line.line_item_id,
            unit_price: line.unit_price,
            qty: line.qty,
            currency: line.currency,
          }))
          await supa.from('offer_lines').insert(offerLines)
        }
      }

      processedCount += 1
    }

    return NextResponse.json({ ok: true, processed: processedCount })
  } catch (err) {
    console.error('email poll error', err)
    const message = err instanceof Error ? err.message : 'Failed to poll email'
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}
