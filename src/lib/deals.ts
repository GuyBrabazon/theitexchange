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
