'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'

type NavItem = {
  label: string
  href: string
  hint?: string
}

type NavGroup = {
  title: string
  items: NavItem[]
}

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 10px',
        borderRadius: 12,
        textDecoration: 'none',
        border: active ? '1px solid rgba(0,0,0,0.08)' : '1px solid transparent',
        background: active ? 'rgba(15,23,42,0.06)' : 'transparent',
        fontWeight: active ? 950 : 850,
        color: 'var(--text)',
      }}
    >
      <span>{label}</span>
      {active ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: 'var(--accent)',
            display: 'inline-block',
          }}
        />
      ) : null}
    </Link>
  )
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const groups: NavGroup[] = useMemo(
    () => [
      {
        title: 'General',
        items: [
          { label: 'Home', href: '/dashboard' },
          { label: 'My account', href: '/dashboard/account' },
        ],
      },
      {
        title: 'Intelligence',
        items: [
          { label: 'Analytics', href: '/dashboard/analytics' },
          { label: 'Reports', href: '/dashboard/reports' },
        ],
      },
      {
        title: 'Core',
        items: [
          { label: 'Lots', href: '/dashboard/lots' },
          { label: 'Buyers', href: '/dashboard/buyers' },
          { label: 'Sellers', href: '/dashboard/sellers' },
          { label: 'Order Fulfilment', href: '/dashboard/order-fulfilment' },
        ],
      },
    ],
    []
  )

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        gap: 16,
        alignItems: 'start',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          position: 'sticky',
          top: 12,
          height: 'calc(100vh - 24px)',
          overflow: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--panel)',
          boxShadow: 'var(--shadow)',
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="The IT Exchange" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div>
            <div style={{ fontWeight: 950, letterSpacing: -0.2, fontSize: 14 }}>The IT Exchange</div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>Broker workspace</div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => (
            <div key={g.title}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontWeight: 900,
                  letterSpacing: 0.2,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                {g.title}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.items.map((it) => (
                  <NavLink key={it.href} href={it.href} label={it.label} active={isActive(pathname, it.href)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Tip: pin this tab — lots move fastest during award → PO.
          </div>
        </div>
      </aside>

      {/* Page content */}
      <section style={{ minWidth: 0 }}>{children}</section>
    </div>
  )
}
