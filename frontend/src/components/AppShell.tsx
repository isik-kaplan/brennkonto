import type { ReactNode } from 'react'

import { NavLink, Outlet } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

const NAV_ITEMS = [
  { to: '/', label: 'Today', end: true },
  { to: '/log', label: 'Log food', end: false },
  { to: '/history', label: 'History', end: false },
  { to: '/trends', label: 'Trends', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

function floatingLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-floating-nav__link is-active' : 'app-floating-nav__link'
}

function tabLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-tabbar__link is-active' : 'app-tabbar__link'
}

function Brand({ className }: { className: string }): ReactNode {
  return (
    <span className={className}>
      <span className="app-floating-nav__brand-mark" aria-hidden="true" />
      brennkonto
    </span>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <nav className="app-floating-nav" aria-label="Primary">
        <Brand className="app-floating-nav__brand" />
        <div className="app-floating-nav__links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={floatingLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="app-floating-nav__user">
          <span className="app-floating-nav__user-name">{user?.display_name}</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </nav>

      <div className="app-paper">
        <header className="app-topbar">
          <Brand className="app-floating-nav__brand" />
          <button type="button" className="btn btn--ghost btn--small" onClick={() => logout()}>
            Log out
          </button>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <nav className="app-tabbar" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={tabLinkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
