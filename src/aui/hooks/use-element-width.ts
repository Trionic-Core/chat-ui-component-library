import { type RefObject, useEffect, useState } from 'react'
import { DEFAULT_CHART_WIDTH_PX } from '../charts/chart-layout'

/**
 * Measured pixel width of `ref`'s element, tracked through resizes.
 *
 * The chart layout policy is a function of the width the chart actually gets:
 * the same block renders at 324px in the widget, 600px in the chat column and
 * 984px in the expand dialog, and the axis budget, the value labels and the
 * orientation all change between them. CSS cannot answer "how many characters
 * fit", so the block has to know the number.
 *
 * Returns `fallback` until the first measurement, and forever without a DOM —
 * server rendering runs no effects, so the fallback is what SSR lays out with.
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  fallback: number = DEFAULT_CHART_WIDTH_PX,
): number {
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      // No observer (older browsers, jsdom without a polyfill): one measurement
      // is still far better than the fallback, and the chart stays static.
      const measured = element.getBoundingClientRect().width
      if (measured > 0) setWidth(measured)
      return
    }

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0
      // A hidden or unmounted host reports 0. Keeping the last good width stops
      // the chart from re-laying itself out as a 0px strip on the way out.
      if (measured > 0) setWidth(measured)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, fallback])

  return width
}
