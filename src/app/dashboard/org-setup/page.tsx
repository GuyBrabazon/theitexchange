'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TenantSettings = {
  default_currency: string | null
  margins_visible_to_brokers: boolean
  ops_can_edit_costs: boolean
  require_finance_approval_for_award: boolean
  work_email_domain: string | null
  po_logo_path: string | null
  po_brand_color: string | null
  po_brand_color_secondary: string | null
  po_terms: string | null
  po_header: string | null
  po_number_start: number | null
  po_number_current: number | null
  accounts_email?: string | null
  registered_address?: string | null
  eori?: string | null
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
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [tenantId, setTenantId] = useState<string>('')
  const [tenantName, setTenantName] = useState<string>('')
  const [settings, setSettings] = useState<TenantSettings>({
    default_currency: 'USD',
    margins_visible_to_brokers: true,
    ops_can_edit_costs: false,
    require_finance_approval_for_award: false,
    work_email_domain: '',
    po_logo_path: '',
    po_brand_color: '',
    po_brand_color_secondary: '',
    po_terms: '',
    po_header: '',
    po_number_start: 1000,
    po_number_current: 1000,
    accounts_email: '',
    registered_address: '',
    eori: '',
  })
  const [users, setUsers] = useState<UserRow[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRow['role']>('broker')
  const [previewOpen, setPreviewOpen] = useState(false)

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
            po_logo_path: settingsRow.po_logo_path ?? '',
            po_brand_color: settingsRow.po_brand_color ?? '',
            po_brand_color_secondary: settingsRow.po_brand_color_secondary ?? '',
            po_terms: settingsRow.po_terms ?? '',
            po_header: settingsRow.po_header ?? '',
            po_number_start: settingsRow.po_number_start ?? 1000,
            po_number_current: settingsRow.po_number_current ?? settingsRow.po_number_start ?? 1000,
            accounts_email: settingsRow.accounts_email ?? '',
            registered_address: settingsRow.registered_address ?? '',
            eori: settingsRow.eori ?? '',
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
            po_logo_path: settings.po_logo_path || null,
            po_brand_color: settings.po_brand_color || null,
            po_brand_color_secondary: settings.po_brand_color_secondary || null,
            po_terms: settings.po_terms || null,
            po_header: settings.po_header || null,
            po_number_start: settings.po_number_start ?? null,
            po_number_current: settings.po_number_current ?? null,
            accounts_email: settings.accounts_email || null,
            registered_address: settings.registered_address || null,
            eori: settings.eori || null,
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

  const handleLogoUpload = async (file: File | null) => {
    if (!file || !tenantId) return
    setError('')
    setSuccess('')
    try {
      setUploadingLogo(true)
      const path = `logos/${tenantId}/po-logo-${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('public').upload(path, file, {
        upsert: true,
        contentType: file.type,
      })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('public').getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) throw new Error('Failed to get public URL for logo')
      setSettings((prev) => ({ ...prev, po_logo_path: url }))
      setSuccess('Logo uploaded and applied to PO template')
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Logo upload failed')
    } finally {
      setUploadingLogo(false)
    }
  }

  const previewPo = async () => {
    try {
      const res = await fetch('/api/po/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview: true, settings }),
      })
      if (!res.ok) throw new Error('Preview failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Failed to preview PO')
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

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Accounts email (send invoices to)</label>
            <input
              type="email"
              placeholder="accounts@company.com"
              value={settings.accounts_email ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, accounts_email: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>EORI</label>
            <input
              type="text"
              placeholder="EORI number"
              value={settings.eori ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, eori: e.target.value }))}
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Registered business address</label>
            <textarea
              value={settings.registered_address ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, registered_address: e.target.value }))}
              rows={3}
              placeholder="Street, City, Country"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', resize: 'vertical' }}
            />
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

        <div style={{ display: 'grid', gap: 12, marginTop: 6 }}>
          <h3 style={{ margin: 0 }}>PO template</h3>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Logo path (storage URL)</label>
              <input
                type="text"
                value={settings.po_logo_path ?? ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, po_logo_path: e.target.value }))}
                placeholder="e.g. https://.../logo.png"
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
                  />
                  {uploadingLogo ? 'Uploading…' : 'Upload logo'}
                </label>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Uploads to public storage and applies URL automatically.
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Primary brand color</label>
              <input
                type="color"
                value={settings.po_brand_color || '#1e3a5f'}
                onChange={(e) => setSettings((prev) => ({ ...prev, po_brand_color: e.target.value }))}
                style={{ height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Secondary brand color</label>
              <input
                type="color"
                value={settings.po_brand_color_secondary || '#2f7f7a'}
                onChange={(e) => setSettings((prev) => ({ ...prev, po_brand_color_secondary: e.target.value }))}
                style={{ height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO number start</label>
              <input
                type="number"
                value={settings.po_number_start ?? 1000}
                onChange={(e) => setSettings((prev) => ({ ...prev, po_number_start: Number(e.target.value) || 0 }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO number current</label>
              <input
                type="number"
                value={settings.po_number_current ?? settings.po_number_start ?? 1000}
                onChange={(e) => setSettings((prev) => ({ ...prev, po_number_current: Number(e.target.value) || 0 }))}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
              />
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Next PO will use this number and increment.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO header (optional)</label>
            <input
              type="text"
              value={settings.po_header ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, po_header: e.target.value }))}
              placeholder="e.g. Purchase Order"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO terms / footer</label>
            <textarea
              value={settings.po_terms ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, po_terms: e.target.value }))}
              rows={4}
              placeholder="Payment terms, delivery notes, etc."
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', resize: 'vertical' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Preview PO
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

      {previewOpen ? (
        <div
          onClick={() => setPreviewOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 70,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(980px, 100%)',
              maxHeight: '90vh',
              overflow: 'auto',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              display: 'grid',
              gap: 14,
              boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>PO preview</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>Preview using current template settings</div>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--surface-2)',
                padding: 16,
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 20, color: settings.po_brand_color || '#1E3A5F' }}>
                    {settings.po_header || 'Purchase Order'}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{tenantName || 'Tenant name'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>PO#{(settings.po_number_current ?? settings.po_number_start ?? 1000).toString()}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Date: {new Date().toLocaleDateString()}</div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
                  gap: 10,
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                  background: 'var(--panel)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Bill to</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{tenantName || 'Your organisation'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>address line, city</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>Supplier</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>Supplier name</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>supplier@email.com</div>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr',
                    background: 'var(--surface-3, var(--surface-2))',
                    fontWeight: 800,
                    fontSize: 12,
                  }}
                >
                  <div style={{ padding: 10, borderRight: '1px solid var(--border)' }}>Description</div>
                  <div style={{ padding: 10, borderRight: '1px solid var(--border)' }}>Qty</div>
                  <div style={{ padding: 10, borderRight: '1px solid var(--border)' }}>Price</div>
                  <div style={{ padding: 10 }}>Line total</div>
                </div>
                {[
                  { desc: 'Server chassis', qty: 2, price: 2500 },
                  { desc: 'Memory kit', qty: 4, price: 300 },
                ].map((line, idx) => (
                  <div
                    key={line.desc}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      background: idx % 2 === 0 ? 'var(--panel)' : 'var(--surface-2)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ padding: 10, borderRight: '1px solid var(--border)' }}>{line.desc}</div>
                    <div style={{ padding: 10, borderRight: '1px solid var(--border)' }}>{line.qty}</div>
                    <div style={{ padding: 10, borderRight: '1px solid var(--border)' }}>${line.price.toLocaleString()}</div>
                    <div style={{ padding: 10 }}>${(line.qty * line.price).toLocaleString()}</div>
                  </div>
                ))}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 24,
                    padding: 12,
                    borderTop: '1px solid var(--border)',
                    fontWeight: 800,
                  }}
                >
                  <span>Subtotal</span>
                  <span>$6,200</span>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--panel)' }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Terms</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                  {settings.po_terms || 'Payment due within 30 days. Delivery within 7 business days.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    try {
                      window.open('/api/po/sample/pdf', '_blank')
                    } catch (err) {
                      console.error(err)
                      alert('Unable to open sample PDF')
                    }
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
                  Download sample PDF
                </button>
                <button
                  onClick={previewPo}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Live preview
                </button>
                <button
                  onClick={() => setPreviewOpen(false)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--panel)',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
