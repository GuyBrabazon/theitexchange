'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TenantSettings = {
  default_currency: string | null
  margins_visible_to_brokers: boolean
  ops_can_edit_costs: boolean
  require_finance_approval_for_award: boolean
  work_email_domain: string | null
  discoverable?: boolean
  accounts_email?: string | null
  registered_address?: string | null
  eori?: string | null
}

const currencies = ['USD', 'EUR', 'GBP', 'ZAR', 'AUD', 'CAD', 'SGD', 'AED']

const parseRegisteredAddress = (value: string | null | undefined) => {
  const lines = (value ?? '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    line1: lines[0] ?? '',
    line2: lines[1] ?? '',
    city: lines[2] ?? '',
    state: lines[3] ?? '',
    country: lines[4] ?? '',
    postcode: lines[5] ?? '',
  }
}

const buildRegisteredAddress = (input: {
  line1: string
  line2: string
  city: string
  state: string
  country: string
  postcode: string
}) =>
  [input.line1, input.line2, input.city, input.state, input.country, input.postcode]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n')

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
    discoverable: false,
    accounts_email: '',
    registered_address: '',
    eori: '',
  })
  const [registeredAddr, setRegisteredAddr] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    country: '',
    postcode: '',
  })
  const compactFieldStyle = {
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    height: 36,
  }
  const fieldStackStyle = {
    display: 'grid',
    gap: 2,
    alignItems: 'start',
  }
  const labelStyle = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.1, display: 'block' }

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

        const [{ data: tenantRow, error: tenantErr }, { data: settingsRow, error: settingsErr }] = await Promise.all([
          supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle(),
          supabase.from('tenant_settings').select('*').eq('tenant_id', profile.tenant_id).maybeSingle(),
        ])

        if (tenantErr) throw tenantErr
        if (settingsErr) throw settingsErr

        setTenantName(tenantRow?.name ?? '')
        if (settingsRow) {
          const parsedAddress = parseRegisteredAddress(settingsRow.registered_address ?? '')
          setSettings({
            default_currency: settingsRow.default_currency ?? 'USD',
            margins_visible_to_brokers: settingsRow.margins_visible_to_brokers ?? true,
            ops_can_edit_costs: settingsRow.ops_can_edit_costs ?? false,
            require_finance_approval_for_award: settingsRow.require_finance_approval_for_award ?? false,
            work_email_domain: settingsRow.work_email_domain ?? '',
            discoverable: settingsRow.discoverable ?? false,
            accounts_email: settingsRow.accounts_email ?? '',
            registered_address: settingsRow.registered_address ?? '',
            eori: settingsRow.eori ?? '',
          })
          setRegisteredAddr({
            line1: parsedAddress.line1,
            line2: parsedAddress.line2,
            city: parsedAddress.city,
            state: parsedAddress.state,
            country: parsedAddress.country,
            postcode: parsedAddress.postcode,
          })
        }

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

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      registered_address: buildRegisteredAddress(registeredAddr),
    }))
  }, [
    registeredAddr.line1,
    registeredAddr.line2,
    registeredAddr.city,
    registeredAddr.state,
    registeredAddr.country,
    registeredAddr.postcode,
  ])

  const saveSettings = async () => {
    if (!tenantId) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const token = await getToken()
      const registeredAddress = buildRegisteredAddress(registeredAddr)
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
            discoverable: settings.discoverable ?? false,
            accounts_email: settings.accounts_email || null,
            registered_address: registeredAddress || null,
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

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <div>Loading organisation settings...</div>
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

        <div
          style={{
            display: 'grid',
            gap: 6,
            alignItems: 'start',
            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          }}
        >
          <div style={fieldStackStyle}>
            <label style={labelStyle}>Default currency</label>
            <select
              value={settings.default_currency ?? 'USD'}
              onChange={(e) => setSettings((prev) => ({ ...prev, default_currency: e.target.value }))}
              style={{ ...compactFieldStyle, color: 'var(--text)' }}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStackStyle}>
            <label style={labelStyle}>Work email domain (optional)</label>
            <input
              type="text"
              placeholder="example.com"
              value={settings.work_email_domain ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, work_email_domain: e.target.value }))}
              style={compactFieldStyle}
            />
            <div style={{ color: 'var(--muted)', fontSize: 11, lineHeight: 1.2, marginTop: 2 }}>
              Enforce invites/signups to this domain. Leave blank to allow any work email.
            </div>
          </div>

          <div style={fieldStackStyle}>
            <label style={labelStyle}>Accounts email (send invoices to)</label>
            <input
              type="email"
              placeholder="accounts@company.com"
              value={settings.accounts_email ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, accounts_email: e.target.value }))}
              style={compactFieldStyle}
            />
          </div>

          <div style={fieldStackStyle}>
            <label style={labelStyle}>EORI</label>
            <input
              type="text"
              placeholder="EORI number"
              value={settings.eori ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, eori: e.target.value }))}
              style={compactFieldStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Registered business address</label>
            <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: '33%' }}>
              <input
                value={registeredAddr.line1}
                onChange={(e) => setRegisteredAddr((prev) => ({ ...prev, line1: e.target.value }))}
                placeholder="Street address 1"
                style={compactFieldStyle}
              />
              <input
                value={registeredAddr.line2}
                onChange={(e) => setRegisteredAddr((prev) => ({ ...prev, line2: e.target.value }))}
                placeholder="Street address 2"
                style={compactFieldStyle}
              />
              <input
                value={registeredAddr.city}
                onChange={(e) => setRegisteredAddr((prev) => ({ ...prev, city: e.target.value }))}
                placeholder="Town/City"
                style={compactFieldStyle}
              />
              <input
                value={registeredAddr.state}
                onChange={(e) => setRegisteredAddr((prev) => ({ ...prev, state: e.target.value }))}
                placeholder="County/State"
                style={compactFieldStyle}
              />
              <input
                value={registeredAddr.country}
                onChange={(e) => setRegisteredAddr((prev) => ({ ...prev, country: e.target.value }))}
                placeholder="Country"
                style={compactFieldStyle}
              />
              <input
                value={registeredAddr.postcode}
                onChange={(e) => setRegisteredAddr((prev) => ({ ...prev, postcode: e.target.value }))}
                placeholder="Zip/Post code"
                style={compactFieldStyle}
              />
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={Boolean(settings.discoverable)}
              onChange={(e) => setSettings((prev) => ({ ...prev, discoverable: e.target.checked }))}
            />
            <span>Allow other tenants to discover our contact details</span>
          </label>
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
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </main>
  )
}
