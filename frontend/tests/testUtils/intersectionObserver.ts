import { vi } from 'vitest'

// jsdom has no IntersectionObserver implementation at all - this stands in for it wherever a
// component (useFoodSearch's infinite scroll, so far) constructs one, and lets a test simulate
// the sentinel element scrolling into view by calling `triggerIntersection()`.
class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly root: Element | Document | null = null
  readonly rootMargin: string = ''
  readonly thresholds: ReadonlyArray<number> = []
  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  observe = vi.fn()
  unobserve = vi.fn()
  // Removes itself from `instances` - mirrors a disconnected observer producing no further
  // callbacks, so triggerIntersection() always resolves to the currently *active* one.
  disconnect = vi.fn(() => {
    const index = MockIntersectionObserver.instances.indexOf(this)
    if (index !== -1) MockIntersectionObserver.instances.splice(index, 1)
  })
  takeRecords = (): IntersectionObserverEntry[] => []

  fire(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this)
  }
}

export function installIntersectionObserverMock() {
  MockIntersectionObserver.instances = []
  window.IntersectionObserver = MockIntersectionObserver
}

// Fires the most recently constructed observer's callback, as if its target's visibility just
// changed - the most recently constructed one is always the currently-active sentinel observer,
// since useFoodSearch tears down and recreates it whenever the relevant state changes.
export function triggerIntersection(isIntersecting = true) {
  const instance = MockIntersectionObserver.instances.at(-1)
  if (!instance) throw new Error('No IntersectionObserver has been constructed yet.')
  instance.fire(isIntersecting)
}
