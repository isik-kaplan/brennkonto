import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ConnectionError from '../../src/components/ConnectionError'

describe('ConnectionError', () => {
  it("shows the can't-connect message and brand", () => {
    render(<ConnectionError onRetry={vi.fn()} />)
    expect(screen.getByText("Can't connect")).toBeInTheDocument()
    expect(
      screen.getByText("brennkonto couldn't reach the server. Check your connection and try again.")
    ).toBeInTheDocument()
  })

  it('calls onRetry when the Retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ConnectionError onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
