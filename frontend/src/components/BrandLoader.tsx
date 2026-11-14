import type { ReactNode } from 'react'

export default function BrandLoader(): ReactNode {
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
