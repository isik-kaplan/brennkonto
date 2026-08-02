import { fireEvent } from '@testing-library/react'

// jsdom has no layout engine, so every element's real getBoundingClientRect() is a zero-sized
// rect at (0, 0) - @dnd-kit's collision detection needs real, non-overlapping rects to resolve a
// drop target, so this stubs one per element based on simple vertical stacking order.
export function stubRects(...elements: HTMLElement[]) {
  elements.forEach((element, index) => {
    const top = index * 60
    element.getBoundingClientRect = () =>
      ({
        top,
        bottom: top + 50,
        left: 0,
        right: 300,
        width: 300,
        height: 50,
        x: 0,
        y: top,
        toJSON() {},
      }) as DOMRect
  })
}

// Simulates a full @dnd-kit pointer-sensor drag: pointerdown on the source's drag handle,
// movement past the sensor's activation distance, movement onto the target's rect, then
// pointerup. stubRects must be called on both row elements first so the movement actually lands
// inside the target's bounds.
export function dragEntryOnto(source: HTMLElement, target: HTMLElement) {
  // dnd-kit's listeners live on the row's dedicated drag handle, not the row itself - the handle
  // has no rect of its own worth stubbing, we just need the pointerdown to originate from it.
  const handle = source.querySelector<HTMLElement>('.entry-row__handle') ?? source
  const sourceRect = source.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const pointerId = 1

  const startX = sourceRect.left + sourceRect.width / 2
  const startY = sourceRect.top + sourceRect.height / 2
  const endX = targetRect.left + targetRect.width / 2
  const endY = targetRect.top + targetRect.height / 2

  // @dnd-kit's PointerSensor activator only accepts the event if isPrimary/button look like a
  // real primary pointer press - jsdom's synthetic PointerEvent doesn't default isPrimary to
  // true, so it must be set explicitly or the whole sequence is silently ignored.
  fireEvent.pointerDown(handle, { pointerId, isPrimary: true, button: 0, clientX: startX, clientY: startY })
  // With activationConstraint.distance configured, the first move past the threshold only
  // *activates* the sensor - it doesn't also report a position. A second move (now that the drag
  // is active) is what actually updates the tracked coordinates collision detection uses.
  fireEvent.pointerMove(document, { pointerId, isPrimary: true, clientX: startX + 10, clientY: startY + 10 })
  fireEvent.pointerMove(document, { pointerId, isPrimary: true, clientX: endX, clientY: endY })
  fireEvent.pointerUp(document, { pointerId, isPrimary: true, clientX: endX, clientY: endY })
}
