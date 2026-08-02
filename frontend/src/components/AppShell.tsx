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

function LogoutIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4H9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 16l4-4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
          <button
            type="button"
            className="btn btn--ghost btn--small btn--icon"
            onClick={() => logout()}
            aria-label="Log out"
            title="Log out"
          >
            <LogoutIcon />
          </button>
        </div>
      </nav>

      <div className="app-paper">
        <header className="app-topbar">
          <Brand className="app-floating-nav__brand" />
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => logout()}
            aria-label="Log out"
            title="Log out"
          >
            <LogoutIcon />
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
