import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ConfirmDialog from '../../src/components/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders the title and message', () => {
    render(<ConfirmDialog title="Remove this?" message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Remove this?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('defaults the confirm button label to "Confirm"', () => {
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('uses a custom confirm label when provided', () => {
    render(<ConfirmDialog title="t" message="m" confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="t" message="m" onConfirm={onConfirm} onCancel={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('uses the primary style when not destructive', () => {
    render(<ConfirmDialog title="t" message="m" onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('btn--primary')
  })

  it('uses the danger style when destructive', () => {
    render(<ConfirmDialog title="t" message="m" isDestructive onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveClass('btn--danger')
  })
})
