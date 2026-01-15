'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type PoSettings = {
  po_logo_path: string | null
  po_brand_color: string | null
  po_brand_color_secondary: string | null
  po_terms: string | null
  po_header: string | null
  po_start_number: number | null
  po_current_number: number | null
}

export default function PoSetupPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [settings, setSettings] = useState<PoSettings>({
    po_logo_path: null,
    po_brand_color: '#1E3A5F',
    po_brand_color_secondary: '#ffffff',
    po_terms: '',
    po_header: 'Purchase Order',
    po_start_number: 1000,
    po_current_number: 1000,
  })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const router = useRouter()

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
        setIsAdmin(profile.role === 'admin')

        const [{ data: tenantRow, error: tenantErr }, { data: settingsRow, error: settingsErr }] = await Promise.all([
          supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle(),
          supabase
            .from('tenant_settings')
            .select('po_logo_path,po_brand_color,po_brand_color_secondary,po_terms,po_header,po_start_number,po_current_number')
            .eq('tenant_id', profile.tenant_id)
            .maybeSingle(),
        ])

        if (tenantErr) throw tenantErr
        if (settingsErr) throw settingsErr

        setTenantName(tenantRow?.name ?? '')
        if (settingsRow) {
          const poStart = settingsRow.po_start_number ?? null
          const poCurrent = settingsRow.po_current_number ?? poStart ?? null
          setSettings({
            po_logo_path: settingsRow.po_logo_path ?? null,
            po_brand_color: settingsRow.po_brand_color ?? '#1E3A5F',
            po_brand_color_secondary: settingsRow.po_brand_color_secondary ?? '#ffffff',
            po_terms: settingsRow.po_terms ?? '',
            po_header: settingsRow.po_header ?? 'Purchase Order',
            po_start_number: poStart ?? 1000,
            po_current_number: poCurrent ?? 1000,
          })
        }
      } catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : 'Failed to load PO settings'
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const save = async () => {
    if (!tenantId) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/org-setup/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          settings: {
            po_logo_path: settings.po_logo_path ?? null,
            po_brand_color: settings.po_brand_color ?? null,
            po_brand_color_secondary: settings.po_brand_color_secondary ?? null,
            po_terms: settings.po_terms ?? null,
            po_header: settings.po_header ?? null,
            po_start_number: settings.po_start_number ?? null,
            po_current_number: settings.po_current_number ?? null,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Save failed')
      setSuccess('PO settings saved')
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (file: File | null) => {
    if (!file || !tenantId) return
    setUploadingLogo(true)
    setError('')
    try {
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `tenant-${tenantId}/po-logo-${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('logos').upload(path, file, {
        upsert: true,
        cacheControl: '3600',
      })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('Failed to get logo URL')
      setSettings((prev) => ({ ...prev, po_logo_path: data.publicUrl }))
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Logo upload failed'
      setError(msg)
    } finally {
      setUploadingLogo(false)
    }
  }

  const openPreview = async () => {
    if (!tenantId) return
    setPreviewOpen(true)
    setPreviewLoading(true)
    setError('')
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
    try {
      const res = await fetch('/api/po/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preview: true,
          tenant_id: tenantId,
          settings: {
            po_logo_path: settings.po_logo_path ?? null,
            po_brand_color: settings.po_brand_color ?? null,
            po_brand_color_secondary: settings.po_brand_color_secondary ?? null,
            po_terms: settings.po_terms ?? null,
            po_header: settings.po_header ?? null,
            po_start_number: settings.po_start_number ?? null,
            po_current_number: settings.po_current_number ?? null,
          },
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Preview failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    } catch (e) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Preview failed'
      setError(msg)
    } finally {
      setPreviewLoading(false)
    }
  }

  const closePreview = () => {
    setPreviewOpen(false)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <div>Loading PO setup…</div>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main style={{ padding: 24 }}>
        <h1>PO setup</h1>
        <div style={{ color: 'var(--muted)' }}>Only admins can manage PO templates.</div>
        <button
          onClick={() => router.push('/dashboard/account')}
          style={{
            marginTop: 16,
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Back to My Account
        </button>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 6 }}>PO setup</h1>
        <div style={{ color: 'var(--muted)' }}>
          Configure purchase order branding, numbering, and preview for {tenantName || 'your organisation'}.
        </div>
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

      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--panel)', display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Logo (optional)</label>
            <input
              type="text"
              value={settings.po_logo_path ?? ''}
              onChange={(e) => setSettings((prev) => ({ ...prev, po_logo_path: e.target.value }))}
              placeholder="Logo URL (optional)"
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
            <label
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--panel)',
                fontWeight: 800,
                cursor: 'pointer',
                width: 'fit-content',
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
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Font color</label>
            <input
              type="color"
              value={settings.po_brand_color || '#1E3A5F'}
              onChange={(e) => setSettings((prev) => ({ ...prev, po_brand_color: e.target.value }))}
              style={{ height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Background color</label>
            <input
              type="color"
              value={settings.po_brand_color_secondary || '#ffffff'}
              onChange={(e) => setSettings((prev) => ({ ...prev, po_brand_color_secondary: e.target.value }))}
              style={{ height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO number start</label>
            <input
              type="number"
              value={settings.po_start_number ?? ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  po_start_number: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO number current</label>
            <input
              type="number"
              value={settings.po_current_number ?? ''}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  po_current_number: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            />
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Next PO will use this number and increment.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--muted)' }}>PO header</label>
          <input
            type="text"
            value={settings.po_header ?? ''}
            onChange={(e) => setSettings((prev) => ({ ...prev, po_header: e.target.value }))}
            placeholder="Purchase Order"
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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={save}
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
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={openPreview}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Preview
          </button>
        </div>
      </div>

      {previewOpen ? (
        <div
          onClick={closePreview}
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
              overflow: 'hidden',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>PO preview</div>
              <button
                onClick={closePreview}
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
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: '#fff', minHeight: 520, overflow: 'hidden' }}>
              {previewLoading ? (
                <div style={{ padding: 16, color: 'var(--muted)' }}>Rendering preview…</div>
              ) : previewUrl ? (
                <iframe title="PO preview" src={previewUrl} style={{ width: '100%', height: '70vh', border: '0' }} />
              ) : (
                <div style={{ padding: 16, color: 'var(--muted)' }}>Preview unavailable.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
