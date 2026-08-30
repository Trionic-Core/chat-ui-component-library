import { type RefObject, useEffect, useState } from 'react'
import { CHAR_PX, chartAxisFont, invalidateCharPx, measureCharPx } from '../charts/label-fit'

/**
 * Mean character width of the labels this chart will actually paint, in the
 * font it will actually paint them in.
 *
 * Both halves were wrong before: the family was the literal "sans-serif" while
 * the host app sets its own brand face, and the sample was a Latin alphabet
 * while the labels might be Devanagari, Arabic or CJK — each of which runs far
 * wider. The fitter then truncated against a width that was never real.
 *
 * `sample` must be a stable string (build it with labelSample()); the
 * measurement re-runs when it changes. Returns the Latin estimate until the
 * element is mounted, and forever without a DOM.
 */
export function useCharPx(ref: RefObject<HTMLElement | null>, sample: string): number {
  const [charPx, setCharPx] = useState(CHAR_PX)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    let cancelled = false

    const measure = () => {
      if (!cancelled) setCharPx(measureCharPx(chartAxisFont(element), sample))
    }
    measure()

    // A measurement taken before a web font arrives is a measurement of the
    // FALLBACK face, and the cache would hold it for the life of the page. The
    // document tells us when its fonts are in; browsers without document.fonts
    // (older Safari, some embedded webviews) keep the first measurement, which
    // costs an ellipsis at worst.
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    if (!fonts) return

    const remeasure = () => {
      if (cancelled) return
      invalidateCharPx(chartAxisFont(element))
      measure()
    }
    void fonts.ready?.then(remeasure)
    fonts.addEventListener?.('loadingdone', remeasure)

    return () => {
      cancelled = true
      fonts.removeEventListener?.('loadingdone', remeasure)
    }
  }, [ref, sample])

  return charPx
}
