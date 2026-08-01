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

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-nav__link is-active' : 'app-nav__link'
}

function tabLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'app-tabbar__link is-active' : 'app-tabbar__link'
}

function Brand(): ReactNode {
  return (
    <span className="app-nav__brand">
      <span className="app-nav__brand-mark" aria-hidden="true" />
      brennkonto
    </span>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Primary">
        <Brand />
        <div className="app-nav__links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="app-nav__user">
          <span className="app-nav__user-name">{user?.display_name}</span>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => logout()}>
            Log out
          </button>
        </div>
      </nav>

      <header className="app-topbar">
        <Brand />
        <button type="button" className="btn btn--ghost btn--small" onClick={() => logout()}>
          Log out
        </button>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

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
