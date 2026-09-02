import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { installIntersectionObserverMock } from './tests/testUtils/intersectionObserver'

installIntersectionObserverMock()

// jsdom doesn't implement the Pointer Capture APIs that @dnd-kit's PointerSensor touches.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {}
}

// jsdom has no PointerEvent class at all (a long-standing gap) - fireEvent.pointerDown/Move/Up
// silently falls back to plain MouseEvent, which has no isPrimary/pointerId, so @dnd-kit's
// PointerSensor (which requires event.isPrimary) never activates without this.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    isPrimary: boolean

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? false
    }
  }
  // @ts-expect-error - minimal test-only polyfill, not a spec-complete PointerEvent
  window.PointerEvent = PointerEventPolyfill
}

afterEach(() => {
  cleanup()
  // Constructed IntersectionObserver instances would otherwise leak between tests within the
  // same file - a stale one from an earlier test could satisfy a later test's
  // triggerIntersection() call even though that test's own hook never observed anything.
  installIntersectionObserverMock()
  // localStorage persists across tests within the same file (theme, history prefs, ...) - clear
  // it so one test's writes can't seed the "stored default" another test's initial render reads.
  localStorage.clear()
})
