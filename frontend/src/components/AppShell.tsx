import type { ReactNode } from 'react'

import { NavLink, Outlet } from 'react-router'

import { useAuth } from '../hooks/useAuth'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

// No `end` needed anywhere: react-router never treats "/" as a prefix of other paths, and every
// other tab should stay active on the pages nested under it.
const NAV_ITEMS = [
  // Stryker disable next-line StringLiteral: AppShell is the root layout route, where an empty path resolves to "/" too
  { to: '/', label: 'Today' },
  { to: '/log', label: 'Log food' },
  { to: '/meals', label: 'Meals' },
  { to: '/history', label: 'History' },
  { to: '/trends', label: 'Trends' },
  { to: '/settings', label: 'Settings' },
]

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
  const isOnline = useOnlineStatus()

  return (
    <div className="app-shell">
      <nav className="app-floating-nav" aria-label="Primary">
        <Brand className="app-floating-nav__brand" />
        <div className="app-floating-nav__links">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'app-floating-nav__link is-active' : 'app-floating-nav__link')}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div className="app-floating-nav__user">
          <span className="app-floating-nav__user-name">
            {/* Only ever rendered inside RequireAuth, so there's always a user. */}
            {user!.display_name}
          </span>
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
          {!isOnline && (
            <div className="form__banner form__banner--warning" role="status">
              You're offline. Some things may not work until you're back online.
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <nav className="app-tabbar" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'app-tabbar__link is-active' : 'app-tabbar__link')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
