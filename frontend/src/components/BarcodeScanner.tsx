import { useEffect, useRef, useState } from 'react'

import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'

interface BarcodeScannerProps {
  onDetected: (code: string) => void
  onClose: () => void
}

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  // Kept in a ref rather than the effect's dependency array - onDetected is a fresh closure on
  // every LogFood render, and restarting the camera stream each time would flash the feed and
  // re-trigger the permission prompt on some browsers.
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs a secure context (https:// or localhost) and is not available here.')
      return
    }

    const reader = new BrowserMultiFormatReader()
    let controls: IScannerControls | null = null
    let cancelled = false

    // The video element renders whenever this effect's setup runs (it's only swapped for the
    // error banner after this effect has had a chance to fail first), so the ref is always
    // populated here - this is a type-only null-to-undefined conversion, not a runtime fallback.
    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current as HTMLVideoElement,
        (result) => {
          // decodeFromConstraints calls back on every frame, successful or not - a failed frame
          // arrives as `result: undefined` and is expected dozens of times a second while nothing
          // decodable is in view, so only an actual hit is worth acting on here.
          if (result && !cancelled) {
            onDetectedRef.current(result.getText())
          }
        }
      )
      .then((scannerControls) => {
        if (cancelled) {
          scannerControls.stop()
          return
        }
        controls = scannerControls
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not access the camera.')
        }
      })

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [])

  return (
    <div className="scanner-overlay" role="dialog" aria-label="Scan a barcode" aria-modal="true">
      <div className="scanner-frame">
        <div className="scanner-viewport">
          {error ? (
            <div className="form__banner">{error}</div>
          ) : (
            <video ref={videoRef} className="scanner-video" muted playsInline />
          )}
          {!error && <div className="scanner-reticle" aria-hidden="true" />}
        </div>
        <p className="scanner-hint">
          {error ? 'Use manual entry or search instead.' : 'Point your camera at a barcode.'}
        </p>
        <button type="button" className="btn btn--block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
