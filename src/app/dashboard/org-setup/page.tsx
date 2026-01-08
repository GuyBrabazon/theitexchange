'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TenantSettings = {
  default_currency: string | null
  margins_visible_to_brokers: boolean
  ops_can_edit_costs: boolean
  require_finance_approval_for_award: boolean
  work_email_domain: string | null
}

type UserRow = {
  id: string
  tenant_id: string | null
  role: string | null
  name: string | null
  company: string | null
  phone: string | null
}

const currencies = ['USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'CAD', 'SGD', 'AED']
const roles: Array<UserRow['role']> = ['admin', 'broker', 'ops', 'finance', 'readonly']

export default function OrgSetupPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')

  const [tenantId, setTenantId] = useState<string>('')
  const [tenantName, setTenantName] = useState<string>('')
  const [settings, setSettings] = useState<TenantSettings>({
    default_currency: 'USD',
    margins_visible_to_brokers: true,
    ops_can_edit_costs: false,
    require_finance_approval_for_award: false,
    work_email_domain: '',
  })
  const [users, setUsers] = useState<UserRow[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRow['role']>('broker')

  const getToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token ?? null
    if (!token) throw new Error('Not authenticated')
    return token
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      setSuccess('')
      try {
        const { data: authRes, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr
        const user = authRes.user
        if (!user) throw new Error('Not authenticated')

        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('tenant_id,role')
          .eq('id', user.id)
          .maybeSingle()
        if (profileErr) throw profileErr
        if (!profile?.tenant_id) throw new Error('Tenant not found')

        setTenantId(profile.tenant_id)

        const [{ data: tenantRow, error: tenantErr }, { data: settingsRow, error: settingsErr }, { data: usersRows, error: usersErr }] =
          await Promise.all([
            supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle(),
            supabase.from('tenant_settings').select('*').eq('tenant_id', profile.tenant_id).maybeSingle(),
            supabase.from('users').select('id,tenant_id,role,name,company,phone').eq('tenant_id', profile.tenant_id).order('created_at', { ascending: true }),
          ])

        if (tenantErr) throw tenantErr
        if (settingsErr) throw settingsErr
        if (usersErr) throw usersErr

        setTenantName(tenantRow?.name ?? '')
        if (settingsRow) {
          setSettings({
            default_currency: settingsRow.default_currency ?? 'USD',
            margins_visible_to_brokers: settingsRow.margins_visible_to_brokers ?? true,
            ops_can_edit_costs: settingsRow.ops_can_edit_costs ?? false,
            require_finance_approval_for_award: settingsRow.require_finance_approval_for_award ?? false,
            work_email_domain: settingsRow.work_email_domain ?? '',
          })
        }

        setUsers(
          (usersRows ?? []).map((u: Record<string, unknown>) => ({
            id: String(u.id ?? ''),
            tenant_id: (u.tenant_id as string | null) ?? null,
            role: (u.role as string | null) ?? 'broker',
            name: (u.name as string | null) ?? null,
            company: (u.company as string | null) ?? null,
            phone: (u.phone as string | null) ?? null,
          }))
        )
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load org settings'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const saveSettings = async () => {
    if (!tenantId) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = await getToken()
      const res = await fetch('/api/org-setup/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          tenant_name: tenantName,
          settings: {
            default_currency: settings.default_currency ?? 'USD',
            margins_visible_to_brokers: settings.margins_visible_to_brokers,
            ops_can_edit_costs: settings.ops_can_edit_costs,
            require_finance_approval_for_award: settings.require_finance_approval_for_award,
            work_email_domain: settings.work_email_domain || null,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Save failed')
      setSuccess('Organisation settings saved')
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const updateRole = async (userId: string, role: string) => {
    if (!tenantId) return
    try {
      const { error } = await supabase.from('users').update({ role }).eq('id', userId).eq('tenant_id', tenantId)
      if (error) throw error
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
      setSuccess('Role updated')
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to update role'
      setError(msg)
    }
  }

  const filteredUsers = useMemo(() => users, [users])

  const sendInvite = async () => {
    setError('')
    setSuccess('')
    if (!inviteEmail.trim()) {
      setError('Invite email is required')
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Invite failed')
      setSuccess('Invite sent')
      setInviteEmail('')
      setInviteRole('broker')
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to send invite'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <div>Loading organisation settings…</div>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>Organisation setup</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 720 }}>
          Configure org-wide defaults, domain policy, and roles. These settings apply to all users in this organisation.
        </p>
      </div>

      {error ? (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--bad)', background: 'rgba(178,58,58,0.08)', color: 'var(--bad)' }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--good)', background: 'rgba(46,125,50,0.08)', color: 'var(--good)' }}>
          {success}
        </div>
      ) : null}

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--panel)', display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Organisation</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Name</label>
          <input
            type="text"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Default currency</label>
            <select
              value={settings.default_currency ?? 'USD'}
              onChange={(e) => setSettings((prev) => ({ ...prev, default_currency: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Work email domain (optional)</label>
            <input
              type="text"
              placeholder="example.com"
              value={settings.work_email_domain ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, work_email_domain: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>
              Enforce invites/signups to this domain. Leave blank to allow any work email.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>Feature flags</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.margins_visible_to_brokers}
              onChange={(e) => setSettings((prev) => ({ ...prev, margins_visible_to_brokers: e.target.checked }))}
            />
            <span>Show margins/profit to Brokers</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.ops_can_edit_costs}
              onChange={(e) => setSettings((prev) => ({ ...prev, ops_can_edit_costs: e.target.checked }))}
            />
            <span>Allow Ops to edit costs</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.require_finance_approval_for_award}
              onChange={(e) => setSettings((prev) => ({ ...prev, require_finance_approval_for_award: e.target.checked }))}
            />
            <span>Require Finance approval before awards</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={saveSettings}
            disabled={saving}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--panel)', display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Users & roles</h2>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>
          Edit roles for users in this organisation. Invites to new users will inherit the chosen role.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="user@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
          />
          <select
            value={inviteRole ?? 'broker'}
            onChange={(e) => setInviteRole(e.target.value as UserRow['role'])}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
          >
            {roles.map((r) => (
              <option key={r ?? 'broker'} value={r ?? 'broker'}>
                {r ?? 'broker'}
              </option>
            ))}
          </select>
          <button
            onClick={sendInvite}
            disabled={saving}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Inviting…' : 'Send invite'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {filteredUsers.map((u) => (
            <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 900 }}>{u.name || 'User'} </div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>ID: {u.id}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Role</label>
                <select
                  value={u.role ?? 'broker'}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel)' }}
                >
                  {roles.map((r) => (
                    <option key={r ?? 'broker'} value={r ?? 'broker'}>
                      {r ?? 'broker'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>No users found.</div> : null}
        </div>
      </div>
    </main>
  )
}
