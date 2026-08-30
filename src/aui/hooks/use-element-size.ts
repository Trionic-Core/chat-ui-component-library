import { type RefObject, useEffect, useState } from 'react'

/* ------------------------------------------------------------------
 * The one ResizeObserver in the AUI renderer.
 *
 * There were two: the block measured a width to feed the layout policy, and
 * the box plot measured a size to draw its own SVG. Two observers is two
 * places for the same edge cases (a hidden host reporting 0, a stale size
 * after unmount) to be got right or wrong independently.
 * ----------------------------------------------------------------*/

export interface ElementSize {
  width: number
  height: number
}

/**
 * Measured size of `ref`'s element, tracked through resizes.
 *
 * The layout policy is a function of the size the chart actually gets: the
 * same block renders at 324px in the widget, 600px in the chat column and
 * 984px in the expand dialog, and the axis budget, the value labels and the
 * orientation all change between them. CSS cannot answer "how many characters
 * fit", so the renderer has to know the number.
 *
 * Returns `fallback` until the first measurement, and forever without a DOM —
 * server rendering runs no effects, so the fallback is what SSR lays out with.
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  fallback: ElementSize,
): ElementSize {
  const [size, setSize] = useState<ElementSize>(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      // No observer (an older browser, a test without the polyfill): one
      // measurement still beats the fallback, and the chart stays static.
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 && height > 0) setSize({ width, height })
      return
    }

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      // A hidden or unmounting host reports 0. Keeping the last good size stops
      // the chart from re-laying itself out as a 0px strip on the way out.
      if (box && box.width > 0 && box.height > 0) {
        setSize({ width: box.width, height: box.height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fallback.width, fallback.height])

  return size
}
