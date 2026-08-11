interface ConnectionErrorProps {
  onRetry: () => void
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v6" strokeLinecap="round" />
      <path d="M12 16.5h.01" strokeLinecap="round" />
    </svg>
  )
}

// Shown in place of the whole app (before AppShell's nav/chrome ever mounts) when the very first
// request - the auth check every route gates on - can't reach the server at all. Once inside the
// app, a dropped connection instead shows AppShell's inline offline banner, since by then there's
// cached UI worth keeping on screen rather than replacing.
export default function ConnectionError({ onRetry }: ConnectionErrorProps) {
  return (
    <div className="auth-page">
      <div className="auth-card connection-error">
        <span className="auth-card__brand">
          <span className="app-floating-nav__brand-mark" aria-hidden="true" />
          brennkonto
        </span>
        <div className="connection-error__icon">
          <AlertIcon />
        </div>
        <h1>Can't connect</h1>
        <p className="auth-card__subtitle">
          brennkonto couldn't reach the server. Check your connection and try again.
        </p>
        <button type="button" className="btn btn--primary btn--block" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  )
}
