import { supabase } from '@/lib/supabase'

export async function ensureProfile() {
  const { data: userRes } = await supabase.auth.getUser()
  const user = userRes.user
  if (!user) throw new Error('Not logged in')

  // profile?
  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) throw profileErr
  if (profile) return profile

  // create tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .insert({ name: 'Default Tenant', owner_id: user.id })
    .select('*')
    .single()

  if (tenantErr) throw tenantErr

  // create profile
  const { data: created, error: insertErr } = await supabase
    .from('users')
    .insert({ id: user.id, tenant_id: tenant.id, role: 'broker' })
    .select('*')
    .single()

  if (insertErr) throw insertErr
  return created
}
