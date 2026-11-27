import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import BrandLoader from '../../src/components/BrandLoader'

describe('BrandLoader', () => {
  it('shows the wordmark full-screen', () => {
    const { container } = render(<BrandLoader />)
    expect(screen.getByText('brennkonto')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(container.firstElementChild).toHaveClass('brand-loader')
  })

  it('drops the wordmark inline, where the nav already shows it', () => {
    const { container } = render(<BrandLoader inline />)
    expect(screen.queryByText('brennkonto')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(container.firstElementChild).toHaveClass('brand-loader--inline')
  })
})
