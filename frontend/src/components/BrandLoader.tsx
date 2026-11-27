import type { ReactNode } from 'react'

// Full-screen with the wordmark while auth resolves; `inline` is the in-page version - the nav
// already shows the wordmark there, so it's just the pulsing mark beside the status text.
export default function BrandLoader({ inline = false }: { inline?: boolean }): ReactNode {
  if (inline) {
    return (
      <div className="centered-loader brand-loader--inline">
        <span className="app-floating-nav__brand-mark brand-loader__mark" aria-hidden="true" />
        <span role="status">Loading…</span>
      </div>
    )
  }
  return (
    <div className="brand-loader">
      <span className="brand-loader__brand">
        <span className="app-floating-nav__brand-mark brand-loader__mark" aria-hidden="true" />
        brennkonto
      </span>
      <span className="brand-loader__status" role="status">
        Loading…
      </span>
    </div>
  )
}
