// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementSize, type ElementSize } from './use-element-size'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'
import { useCharPx } from './use-char-px'

/* ------------------------------------------------------------------
 * The three hooks that only exist because of the DOM.
 *
 * The rest of the suite runs in the node environment, where an effect never
 * fires — so a ResizeObserver hook there is asserted by reading it, which is
 * not a test. This ONE file mounts for real in jsdom: the observer is stubbed
 * so the test can push a resize, and the assertions are about what the hook
 * does with what it is pushed.
 * ----------------------------------------------------------------*/

const FALLBACK: ElementSize = { width: 600, height: 256 }

/** Callbacks handed to the stub, so a test can drive a resize. */
let observers: {
  callback: ResizeObserverCallback
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}[] = []

class StubResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    observers.push({ callback, observe: vi.fn(), disconnect: vi.fn() })
  }
  observe(...args: unknown[]) {
    observers[observers.length - 1].observe(...args)
  }
  unobserve() {}
  disconnect() {
    observers[observers.length - 1].disconnect()
  }
}

/** Push one resize through the observer the hook registered. */
function resizeTo(width: number, height: number) {
  const entry = { contentRect: { width, height } } as unknown as ResizeObserverEntry
  act(() => {
    observers[0].callback([entry], {} as ResizeObserver)
  })
}

let container: HTMLDivElement
let root: Root
/** What the probe most recently rendered, read without a testing library. */
let seen: ElementSize

function Probe() {
  const ref = useRef<HTMLDivElement>(null)
  seen = useElementSize(ref, FALLBACK)
  return createElement('div', { ref })
}

function mount(element: Parameters<Root['render']>[0]) {
  act(() => {
    root.render(element)
  })
}

beforeEach(() => {
  observers = []
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', StubResizeObserver)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('useElementSize', () => {
  it('reports the fallback until the observer measures', () => {
    mount(createElement(Probe))
    expect(seen).toEqual(FALLBACK)
  })

  it('observes the element it was given', () => {
    mount(createElement(Probe))
    expect(observers).toHaveLength(1)
    expect(observers[0].observe).toHaveBeenCalledTimes(1)
  })

  it('takes the measured size on resize', () => {
    mount(createElement(Probe))
    resizeTo(984, 400)
    expect(seen).toEqual({ width: 984, height: 400 })
  })

  it('keeps the last good size when the host reports zero', () => {
    // A hidden or unmounting host measures 0. Taking that would re-lay the
    // chart out as a 0px strip on its way off the screen.
    mount(createElement(Probe))
    resizeTo(984, 400)
    resizeTo(0, 0)
    expect(seen).toEqual({ width: 984, height: 400 })
    resizeTo(324, 200)
    expect(seen).toEqual({ width: 324, height: 200 })
  })

  it('ignores a zero in either dimension', () => {
    mount(createElement(Probe))
    resizeTo(984, 0)
    expect(seen).toEqual(FALLBACK)
    resizeTo(0, 400)
    expect(seen).toEqual(FALLBACK)
  })

  it('disconnects on unmount', () => {
    mount(createElement(Probe))
    act(() => root.render(null))
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('falls back to a single measurement without a ResizeObserver', () => {
    // An older browser, or a host that never polyfilled it: one measurement
    // still beats the fallback, and the chart simply stays that size.
    vi.unstubAllGlobals()
    vi.stubGlobal('ResizeObserver', undefined)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 812,
      height: 300,
    } as DOMRect)

    mount(createElement(Probe))
    expect(seen).toEqual({ width: 812, height: 300 })
    vi.restoreAllMocks()
  })
})

describe('usePrefersReducedMotion', () => {
  let reduced: boolean
  let listeners: ((event: MediaQueryListEvent) => void)[] = []

  function MotionProbe() {
    reduced = usePrefersReducedMotion()
    return null
  }

  /** matchMedia is not implemented in jsdom, so the test supplies one. */
  function stubMatchMedia(matches: boolean) {
    listeners = []
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches,
        addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
          listeners.push(fn),
        removeEventListener: () => {
          listeners = []
        },
      })),
    )
  }

  it('is false when the reader has asked for nothing', () => {
    stubMatchMedia(false)
    mount(createElement(MotionProbe))
    expect(reduced).toBe(false)
  })

  it('is true when the system setting is on', () => {
    stubMatchMedia(true)
    mount(createElement(MotionProbe))
    expect(reduced).toBe(true)
  })

  it('follows the setting when it changes mid-session', () => {
    stubMatchMedia(false)
    mount(createElement(MotionProbe))
    act(() => {
      listeners.forEach((fn) => fn({ matches: true } as MediaQueryListEvent))
    })
    expect(reduced).toBe(true)
  })

  it('stops listening on unmount', () => {
    stubMatchMedia(false)
    mount(createElement(MotionProbe))
    act(() => root.render(null))
    expect(listeners).toHaveLength(0)
  })
})

describe('useCharPx — a measurement taken before the web font arrived', () => {
  let perChar: number
  let seenCharPx: number
  let fontsListeners: Record<string, () => void>
  let resolveReady: () => void

  function CharProbe({ sample }: { sample: string }) {
    const ref = useRef<HTMLDivElement>(null)
    seenCharPx = useCharPx(ref, sample)
    return createElement('div', { ref, style: { fontFamily: 'ProbeFont' } })
  }

  /** A canvas whose glyphs are exactly `perChar` px wide, changeable mid-test. */
  function stubCanvas() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          font: '',
          measureText: (text: string) => ({ width: text.length * perChar }),
        }) as unknown as CanvasRenderingContext2D,
    )
  }

  /** document.fonts is a getter, so stubGlobal cannot reach it. */
  function stubFonts(present: boolean) {
    fontsListeners = {}
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve
    })
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: present
        ? {
            ready,
            addEventListener: (event: string, fn: () => void) => {
              fontsListeners[event] = fn
            },
            removeEventListener: (event: string) => {
              delete fontsListeners[event]
            },
          }
        : undefined,
    })
  }

  beforeEach(() => {
    perChar = 5
    stubCanvas()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'fonts')
  })

  it('measures the mounted host on the first frame', () => {
    stubFonts(false)
    mount(createElement(CharProbe, { sample: 'first-sample' }))
    expect(seenCharPx).toBe(5)
  })

  it('re-measures once the document reports its fonts ready', async () => {
    // The first measurement was of the FALLBACK face. Without invalidation the
    // cache would hold that width for the life of the page, and every label on
    // the chart would be fitted against a font the reader never sees.
    stubFonts(true)
    mount(createElement(CharProbe, { sample: 'webfont-sample' }))
    expect(seenCharPx).toBe(5)

    perChar = 9
    await act(async () => {
      resolveReady()
      await Promise.resolve()
    })
    expect(seenCharPx).toBe(9)
  })

  it('re-measures again when another face finishes loading', async () => {
    stubFonts(true)
    mount(createElement(CharProbe, { sample: 'loadingdone-sample' }))
    expect(seenCharPx).toBe(5)

    perChar = 11
    await act(async () => {
      fontsListeners.loadingdone?.()
    })
    expect(seenCharPx).toBe(11)
  })

  it('keeps the first measurement without document.fonts', async () => {
    // Older Safari and some embedded webviews. The first measurement stands,
    // which costs an ellipsis at worst.
    stubFonts(false)
    mount(createElement(CharProbe, { sample: 'no-fonts-api-sample' }))
    perChar = 9
    await act(async () => {})
    expect(seenCharPx).toBe(5)
  })

  it('stops listening on unmount', () => {
    stubFonts(true)
    mount(createElement(CharProbe, { sample: 'unmount-sample' }))
    act(() => root.render(null))
    expect(fontsListeners.loadingdone).toBeUndefined()
  })
})
