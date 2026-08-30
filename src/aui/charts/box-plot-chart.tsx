import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_GRID_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_INITIAL_DIMENSION,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartFieldRef } from '../aui-types'
import type { ChartProps } from './types'
import { axisFieldFor, formatSeriesValue } from './chart-helpers'
import { ChartEmpty } from './chart-empty'
import { fitCategoryLabels } from './label-fit'
import {
  BOX_PLOT_KEYS,
  type BoxPlotKey,
  type BoxStat,
  bandCenter,
  boxPlotDomain,
  computeBoxPlotLayout,
  makeValueScale,
  parseBoxPlotRows,
  resolveBoxPlotSeries,
  valueAxisTicks,
} from './box-plot-geometry'

/* ------------------------------------------------------------------
 * Box plot — the distribution of one measure across categories.
 *
 * recharts ships no box plot and exposes no public API for reading its axis
 * scales from a custom child (`useResponsiveContainerContext` is internal), so
 * this draws its own SVG over the shared theme tokens rather than bending a
 * Bar into the wrong shape. Every coordinate comes from box-plot-geometry.ts,
 * which is pure and unit-tested; this file only paints and handles input.
 *
 * Wire contract: `x` is the category, and `series` carries exactly the five
 * keys q_min / q1 / median / q3 / q_max in any order. They are matched BY NAME.
 * ----------------------------------------------------------------*/

const BOX_FILL_OPACITY = 0.18
const BOX_STROKE_WIDTH = 1.5
const MEDIAN_STROKE_WIDTH = 2
/** Whisker cap width as a share of the box width. */
const CAP_RATIO = 0.55
/** Boxes past this index share the last entrance delay, so a wide chart still settles quickly. */
const MAX_STAGGER_STEPS = 10

export function BoxPlotChart({ data, x, series }: ChartProps) {
  const resolution = useMemo(() => resolveBoxPlotSeries(series), [series])
  // The five quartiles are one measure seen five ways, so the value axis takes
  // a unit only when all five series agree on it (axisFieldFor); a disagreement
  // means the payload is inconsistent, and an axis cannot be in two units.
  const valueField = useMemo(() => axisFieldFor(series), [series])
  const parse = useMemo(() => parseBoxPlotRows(data, x.key), [data, x.key])

  if (!resolution.fields) {
    return (
      <ChartEmpty
        reason="missing_quartile_series"
        label={`Box plot needs the ${BOX_PLOT_KEYS.length} quartile series — missing ${resolution.missing.join(', ')}`}
      />
    )
  }

  if (parse.boxes.length === 0) {
    return <ChartEmpty reason={parse.rejection ?? 'no_rows'} label={emptyLabel(parse.rejection)} />
  }

  return (
    <BoxPlotSurface
      boxes={parse.boxes}
      category={x}
      measure={resolution.fields.median}
      valueField={valueField}
      omitted={parse.omitted}
    />
  )
}

function emptyLabel(rejection: ReturnType<typeof parseBoxPlotRows>['rejection']): string {
  switch (rejection) {
    case 'non_monotonic_quartiles':
      return 'No distribution to plot — the quartiles are not ordered q_min ≤ q1 ≤ median ≤ q3 ≤ q_max'
    case 'non_numeric_quartiles':
      return 'No distribution to plot — the quartile values are missing or not numeric'
    default:
      return 'No data'
  }
}

/* ------------------------------- Surface ------------------------------- */

interface BoxPlotSurfaceProps {
  boxes: BoxStat[]
  category: ChartFieldRef
  measure: ChartFieldRef
  /** Format and unit the whole value axis speaks in — see axisFieldFor. */
  valueField: ChartFieldRef
  omitted: number
}

function BoxPlotSurface({ boxes, category, measure, valueField, omitted }: BoxPlotSurfaceProps) {
  const [host, size] = useElementSize()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const color = getChartColor(0)
  const printTick = useCallback(
    (value: number) => formatSeriesValue(value, valueField, { compact: true }),
    [valueField],
  )
  const printValue = useCallback(
    (value: number) => formatSeriesValue(value, valueField, { compact: false }),
    [valueField],
  )

  const geometry = useMemo(() => {
    const domain = boxPlotDomain(boxes)
    const ticks = valueAxisTicks(domain)
    const layout = computeBoxPlotLayout(size.width, size.height, boxes.length, ticks.map(printTick))
    return { ticks, layout, scale: makeValueScale(domain, layout.plotTop, layout.plotHeight) }
  }, [boxes, size.width, size.height, printTick])

  const { ticks, layout, scale } = geometry

  // Only the labels that actually print are fitted together, so the
  // distinguishability check sees exactly the set the reader will compare.
  const categoryLabels = useMemo(() => {
    const indices = boxes.map((_, index) => index).filter((index) => index % layout.labelStride === 0)
    const fitted = fitCategoryLabels(
      indices.map((index) => boxes[index].category),
      layout.labelMaxChars,
    )
    return indices.map((index, position) => ({ index, label: fitted[position] }))
  }, [boxes, layout.labelStride, layout.labelMaxChars])

  const clearActive = useCallback(() => setActiveIndex(null), [])
  // Carry the index with the box so the tooltip can place itself without the
  // caller re-asserting that a non-null box implies a non-null index.
  const active = useMemo(() => {
    if (activeIndex === null) return null
    const box = boxes[activeIndex]
    return box ? { index: activeIndex, box } : null
  }, [activeIndex, boxes])

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div ref={host} className="relative min-h-0 w-full flex-1">
        <svg
          width={size.width}
          height={size.height}
          role="group"
          aria-label={`Box plot of ${measure.label} distribution by ${category.label}, ${boxes.length} categories`}
          onPointerLeave={clearActive}
        >
          {/* Value grid + axis. Horizontal only, matching the cartesian charts. */}
          {ticks.map((tick) => {
            const y = scale(tick)
            return (
              <g key={tick}>
                <line
                  x1={layout.plotLeft}
                  x2={layout.plotLeft + layout.plotWidth}
                  y1={y}
                  y2={y}
                  stroke={CHART_GRID_STYLE.stroke}
                  strokeDasharray={CHART_GRID_STYLE.strokeDasharray}
                  strokeOpacity={CHART_GRID_STYLE.strokeOpacity}
                />
                <text
                  x={layout.plotLeft - CHART_Y_AXIS.tickMargin}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={CHART_Y_AXIS.fontSize}
                  fontFamily={CHART_Y_AXIS.fontFamily}
                  fill={CHART_Y_AXIS.stroke}
                >
                  {printTick(tick)}
                </text>
              </g>
            )
          })}

          {boxes.map((box, index) => (
            <BoxMark
              key={`${box.category}-${index}`}
              box={box}
              index={index}
              color={color}
              layout={layout}
              scale={scale}
              category={category}
              printValue={printValue}
              isActive={index === activeIndex}
              onActivate={setActiveIndex}
              onDeactivate={clearActive}
            />
          ))}

          {/* Category labels, thinned out when the bands get too narrow to read. */}
          {categoryLabels.map(({ index, label }) => (
            <text
              key={`label-${index}`}
              x={bandCenter(layout, index)}
              y={layout.plotTop + layout.plotHeight + CHART_X_AXIS.tickMargin + 4}
              textAnchor="middle"
              fontSize={CHART_X_AXIS.fontSize}
              fontFamily={CHART_X_AXIS.fontFamily}
              fill={CHART_X_AXIS.stroke}
            >
              {label}
            </text>
          ))}
        </svg>

        {active && (
          <BoxTooltip
            box={active.box}
            printValue={printValue}
            x={bandCenter(layout, active.index)}
            y={scale(active.box.q_max)}
            containerWidth={size.width}
          />
        )}
      </div>

      {omitted > 0 && (
        <p
          className="pt-1 text-center text-[11px]"
          style={{ color: 'var(--cx-text-muted)' }}
          data-cxc-omitted={omitted}
        >
          {omitted} {omitted === 1 ? 'category' : 'categories'} not shown — inconsistent quartile
          values
        </p>
      )}
    </div>
  )
}

/* -------------------------------- Marks -------------------------------- */

interface BoxMarkProps {
  box: BoxStat
  index: number
  color: string
  layout: ReturnType<typeof computeBoxPlotLayout>
  scale: (value: number) => number
  category: ChartFieldRef
  printValue: (value: number) => string
  isActive: boolean
  onActivate: (index: number) => void
  onDeactivate: () => void
}

function BoxMark({
  box,
  index,
  color,
  layout,
  scale,
  category,
  printValue,
  isActive,
  onActivate,
  onDeactivate,
}: BoxMarkProps) {
  const center = bandCenter(layout, index)
  const half = layout.boxWidth / 2
  const capHalf = half * CAP_RATIO

  const yMax = scale(box.q_max)
  const yQ3 = scale(box.q3)
  const yMedian = scale(box.median)
  const yQ1 = scale(box.q1)
  const yMin = scale(box.q_min)
  // A degenerate distribution (q1 === q3) would otherwise draw a zero-height
  // rect, which paints nothing at all; 1px keeps the box visible and honest.
  const boxHeight = Math.max(1, yQ1 - yQ3)

  const activate = useCallback(() => onActivate(index), [onActivate, index])

  return (
    <g
      role="img"
      tabIndex={0}
      aria-label={describeBox(box, category, printValue)}
      className="cxc-boxplot-mark focus:outline-none"
      style={{ animationDelay: `${Math.min(index, MAX_STAGGER_STEPS) * 40}ms` }}
      onPointerEnter={activate}
      onPointerDown={activate}
      onFocus={activate}
      onBlur={onDeactivate}
    >
      {/* Whisker stem + caps */}
      <line x1={center} x2={center} y1={yMax} y2={yQ3} stroke={color} strokeWidth={BOX_STROKE_WIDTH} />
      <line x1={center} x2={center} y1={yQ1} y2={yMin} stroke={color} strokeWidth={BOX_STROKE_WIDTH} />
      <line
        x1={center - capHalf}
        x2={center + capHalf}
        y1={yMax}
        y2={yMax}
        stroke={color}
        strokeWidth={BOX_STROKE_WIDTH}
      />
      <line
        x1={center - capHalf}
        x2={center + capHalf}
        y1={yMin}
        y2={yMin}
        stroke={color}
        strokeWidth={BOX_STROKE_WIDTH}
      />

      {/* Interquartile box */}
      <rect
        x={center - half}
        y={yQ3}
        width={layout.boxWidth}
        height={boxHeight}
        rx={2}
        fill={color}
        fillOpacity={isActive ? BOX_FILL_OPACITY * 2 : BOX_FILL_OPACITY}
        stroke={color}
        strokeWidth={BOX_STROKE_WIDTH}
      />

      {/* Median. Drawn in the text token, not the series hue: it must stay
          legible on the tinted box in both themes, and it must never be
          mistaken for the box outline. */}
      <line
        x1={center - half}
        x2={center + half}
        y1={yMedian}
        y2={yMedian}
        stroke="var(--cx-text-primary)"
        strokeWidth={MEDIAN_STROKE_WIDTH}
      />

      {/* Hit target. A 6px box on a phone is untappable, so the whole band
          height is the target; it stays transparent and carries the pointer
          events for the marks above, which are inert. */}
      <rect
        x={center - layout.bandWidth / 2}
        y={layout.plotTop}
        width={layout.bandWidth}
        height={layout.plotHeight}
        fill="transparent"
      />
    </g>
  )
}

/** Full sentence for assistive tech — the five numbers, never colour alone. */
function describeBox(
  box: BoxStat,
  category: ChartFieldRef,
  printValue: (value: number) => string,
): string {
  return (
    `${category.label} ${box.category}: ` +
    `minimum ${printValue(box.q_min)}, ` +
    `lower quartile ${printValue(box.q1)}, ` +
    `median ${printValue(box.median)}, ` +
    `upper quartile ${printValue(box.q3)}, ` +
    `maximum ${printValue(box.q_max)}`
  )
}

/* ------------------------------- Tooltip ------------------------------- */

// Typed to the five quartile keys, not to keyof BoxStat: the category is a
// string and would not survive a numeric formatter.
const TOOLTIP_ROWS: { key: BoxPlotKey; label: string }[] = [
  { key: 'q_max', label: 'Max' },
  { key: 'q3', label: 'Q3' },
  { key: 'median', label: 'Median' },
  { key: 'q1', label: 'Q1' },
  { key: 'q_min', label: 'Min' },
]
const TOOLTIP_WIDTH = 148
/** Below this y the tooltip would clip the top edge, so it flips underneath. */
const TOOLTIP_FLIP_THRESHOLD = 96

function BoxTooltip({
  box,
  printValue,
  x,
  y,
  containerWidth,
}: {
  box: BoxStat
  printValue: (value: number) => string
  x: number
  y: number
  containerWidth: number
}) {
  const half = TOOLTIP_WIDTH / 2
  const left = Math.min(Math.max(x, half), Math.max(half, containerWidth - half))
  const flip = y < TOOLTIP_FLIP_THRESHOLD

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 px-2 py-1.5"
      style={{
        ...CHART_TOOLTIP_STYLE,
        width: TOOLTIP_WIDTH,
        left,
        top: flip ? y + 8 : y - 8,
        transform: flip ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      <p className="mb-1 truncate font-medium" style={{ color: 'var(--cx-text-primary)' }}>
        {box.category}
      </p>
      {TOOLTIP_ROWS.map((row) => (
        <div key={row.key} className="flex justify-between gap-3">
          <span style={{ color: 'var(--cx-text-muted)' }}>{row.label}</span>
          <span style={{ color: 'var(--cx-text-primary)' }}>
            {printValue(box[row.key])}
          </span>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------- Sizing ------------------------------- */

/**
 * Measure the host element, falling back to the shared first-frame dimensions.
 *
 * Same job recharts' ResponsiveContainer does for the other wrappers, but its
 * size context is not part of the public API, so a custom child cannot read it
 * without depending on internals. The fallback keeps server rendering and the
 * pre-observer first frame from drawing at 0 x 0.
 */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number }>({
    ...CHART_INITIAL_DIMENSION,
  })

  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}
