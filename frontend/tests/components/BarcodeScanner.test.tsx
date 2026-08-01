import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BarcodeScanner from '../../src/components/BarcodeScanner'

type DecodeCallback = (result: { getText(): string } | undefined) => void

const { decodeFromConstraints, mockReaderInstance } = vi.hoisted(() => {
  const decodeFromConstraints = vi.fn()
  return { decodeFromConstraints, mockReaderInstance: { decodeFromConstraints } }
})

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(function BrowserMultiFormatReader() {
    return mockReaderInstance
  }),
}))

function stubCamera() {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  })
}

function removeCamera() {
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
}

beforeEach(() => {
  decodeFromConstraints.mockReset()
})

afterEach(() => {
  removeCamera()
})

describe('BarcodeScanner', () => {
  it('shows a secure-context error when the camera API is unavailable', () => {
    removeCamera()
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Camera access needs a secure context/)).toBeInTheDocument()
    expect(screen.getByText('Use manual entry or search instead.')).toBeInTheDocument()
    expect(document.querySelector('.scanner-video')).not.toBeInTheDocument()
  })

  it('starts the scanner and shows the camera hint once available', async () => {
    stubCamera()
    const stop = vi.fn()
    decodeFromConstraints.mockResolvedValue({ stop })
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)

    await waitFor(() => expect(decodeFromConstraints).toHaveBeenCalled())
    expect(screen.getByText('Point your camera at a barcode.')).toBeInTheDocument()
    expect(decodeFromConstraints).toHaveBeenCalledWith(
      { video: { facingMode: 'environment' } },
      expect.anything(),
      expect.any(Function)
    )
  })

  it('calls onDetected with the decoded text on a successful frame', async () => {
    stubCamera()
    decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })
    const onDetected = vi.fn()
    render(<BarcodeScanner onDetected={onDetected} onClose={vi.fn()} />)
    await waitFor(() => expect(decodeFromConstraints).toHaveBeenCalled())

    const callback = decodeFromConstraints.mock.calls[0][2] as DecodeCallback
    callback({ getText: () => '3017620422003' })
    expect(onDetected).toHaveBeenCalledWith('3017620422003')
  })

  it('ignores frames with no result', async () => {
    stubCamera()
    decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })
    const onDetected = vi.fn()
    render(<BarcodeScanner onDetected={onDetected} onClose={vi.fn()} />)
    await waitFor(() => expect(decodeFromConstraints).toHaveBeenCalled())

    const callback = decodeFromConstraints.mock.calls[0][2] as DecodeCallback
    callback(undefined)
    expect(onDetected).not.toHaveBeenCalled()
  })

  it('shows an error message when starting the camera fails', async () => {
    stubCamera()
    decodeFromConstraints.mockRejectedValue(new Error('Permission denied'))
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument())
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    stubCamera()
    decodeFromConstraints.mockRejectedValue('nope')
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Could not access the camera.')).toBeInTheDocument())
  })

  it('stops the scanner controls on unmount', async () => {
    stubCamera()
    const stop = vi.fn()
    decodeFromConstraints.mockResolvedValue({ stop })
    const { unmount } = render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(decodeFromConstraints).toHaveBeenCalled())

    unmount()
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })

  it('stops the controls immediately if resolution completes after unmount', async () => {
    stubCamera()
    const stop = vi.fn()
    let resolveDecode: (value: { stop: () => void }) => void = () => {}
    decodeFromConstraints.mockReturnValue(
      new Promise((resolve) => {
        resolveDecode = resolve
      })
    )
    const { unmount } = render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)
    unmount()
    resolveDecode({ stop })
    await waitFor(() => expect(stop).toHaveBeenCalled())
  })

  it('does not set an error if the camera rejects after unmount', async () => {
    stubCamera()
    let rejectDecode: (err: Error) => void = () => {}
    decodeFromConstraints.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDecode = reject
      })
    )
    const { unmount } = render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />)
    unmount()
    rejectDecode(new Error('too late'))
    // nothing to assert on the (now unmounted) DOM - this exercises the cancelled branch inside
    // the rejection handler and confirms it doesn't throw an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('calls onClose when Cancel is clicked', async () => {
    removeCamera()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<BarcodeScanner onDetected={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
