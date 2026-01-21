import type { SupabaseClient } from '@supabase/supabase-js'

export type DealInsertPayload = {
  tenant_id: string
  buyer_id: string
  title: string
  status?: 'draft' | 'outreach' | 'negotiating' | 'agreed' | 'ordered' | 'fulfilled' | 'closed' | 'lost'
  deal_type?: 'sell' | 'buy' | 'broker'
  currency?: string
  source?: 'inventory' | 'flip' | 'mixed'
  created_by?: string | null
  expected_close_date?: string | null
  stage_notes?: string | null
}

export type DealLineInsertPayload = {
  deal_id: string
  tenant_id: string
  source: 'inventory' | 'flip'
  line_ref: string
  qty?: number
  ask_price?: number
  cost_snapshot?: number
  currency?: string | null
  model?: string | null
  description?: string | null
  oem?: string | null
  inventory_item_id?: string | null
  inventory_unit_id?: string | null
  meta?: Record<string, unknown>
  status?: 'draft' | 'quoted' | 'offered' | 'agreed' | 'ordered' | 'allocated' | 'shipped' | 'delivered' | 'cancelled'
}

type DealThreadPayload = {
  tenant_id: string
  deal_id: string
  buyer_email: string
  subject_key: string
  subject_template: string
  created_by?: string | null
  status?: 'active' | 'closed'
}

const THREAD_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generateDealSubjectKey() {
  let key = ''
  for (let i = 0; i < 6; i += 1) {
    key += THREAD_KEY_CHARS.charAt(Math.floor(Math.random() * THREAD_KEY_CHARS.length))
  }
  return `DL-${key}`
}

export async function fetchDealDetail(supa: SupabaseClient, tenantId: string, dealId: string) {
  const { data, error } = await supa
    .from('deals')
    .select(
      [
        'id',
        'title',
        'status',
        'currency',
        'source',
        'last_activity_at',
        'expected_close_date',
        'stage_notes',
        'buyer:buyers(id,name,company,email,oem_tags,model_tags,tags)',
      ].join(',')
    )
    .eq('id', dealId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function fetchDealLinesForDeal(supa: SupabaseClient, tenantId: string, dealId: string) {
  const { data, error } = await supa
    .from('deal_lines')
    .select(
      'id,line_ref,source,qty,ask_price,currency,status,model,description,oem,inventory_item_id,inventory_items(id,sku,model,description)'
    )
    .eq('deal_id', dealId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchDealThreadsForDeal(supa: SupabaseClient, tenantId: string, dealId: string) {
  const { data, error } = await supa
    .from('deal_threads')
    .select('id,buyer_email,subject_key,subject_template,status,created_at')
    .eq('deal_id', dealId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchEmailOffersForDeal(supa: SupabaseClient, tenantId: string, dealId: string) {
  const { data, error } = await supa
    .from('email_offers')
    .select('id,buyer_email,buyer_name,received_at,status,deal_thread_id,email_offer_lines(line_ref,offer_amount,offer_type,qty,parse_notes)')
    .eq('tenant_id', tenantId)
    .eq('deal_id', dealId)
    .order('received_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function updateDealStatus(supa: SupabaseClient, dealId: string, status: string) {
  const now = new Date().toISOString()
  const { data, error } = await supa
    .from('deals')
    .update({ status, updated_at: now, last_activity_at: now })
    .eq('id', dealId)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function insertDeal(supa: SupabaseClient, payload: DealInsertPayload) {
  const { data, error } = await supa.from('deals').insert([{ ...payload }]).select('*').single()
  if (error) throw error
  return data
}

export async function fetchDealsForTenant(supa: SupabaseClient, tenantId: string) {
  const { data, error } = await supa
    .from('deals')
    .select('id,title,status,buyer_id,last_activity_at,source,currency')
    .eq('tenant_id', tenantId)
    .order('last_activity_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function insertDealLine(supa: SupabaseClient, payload: DealLineInsertPayload) {
  const { data, error } = await supa.from('deal_lines').insert([{ ...payload }]).select('*').single()
  if (error) throw error
  return data
}

export async function ensureDealThread(supa: SupabaseClient, payload: DealThreadPayload) {
  const { data, error } = await supa
    .from('deal_threads')
    .upsert([{ ...payload }], { onConflict: 'subject_key' })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function fetchDealThreads(supa: SupabaseClient, tenantId: string) {
  const { data, error } = await supa
    .from('deal_threads')
    .select('id,deal_id,buyer_email,subject_key,status')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return data ?? []
}
