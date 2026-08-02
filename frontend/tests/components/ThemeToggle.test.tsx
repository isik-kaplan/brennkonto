import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import ThemeToggle from '../../src/components/ThemeToggle'
import { ThemeProvider } from '../../src/hooks/useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  )
}

describe('ThemeToggle', () => {
  it('marks Auto active by default', () => {
    renderToggle()
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Light' })).not.toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Dark' })).not.toHaveClass('is-active')
  })

  it('switches the active option and the data-theme attribute on click', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(screen.getByRole('button', { name: 'Dark' }))

    expect(screen.getByRole('button', { name: 'Dark' })).toHaveClass('is-active')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
