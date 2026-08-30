import { useMemo } from 'react'
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type LabelProps,
} from 'recharts'
import {
  CHART_X_AXIS,
  CHART_Y_AXIS,
  CHART_GRID_STYLE,
  CHART_TOOLTIP_STYLE,
  CHART_ANIMATION,
  CHART_INITIAL_DIMENSION,
  CHART_VALUE_LABEL_STYLE,
  CHART_ZERO_LINE_STYLE,
} from '../chart-theme'
import { getChartColor } from '../chart-colors'
import type { ChartProps } from './types'
import {
  formatAxisTick,
  formatTooltipValue,
  shouldShowLegend,
  chartLegendProps,
  BAR_VALUE_DOMAIN,
} from './chart-helpers'
import {
  BAND_PX,
  DEFAULT_CHART_WIDTH_PX,
  VALUE_AXIS_ESTIMATE_PX,
  VALUE_LABEL_LINE_PX,
  planBarLayout,
  valueLabelAnchor,
  valueLabelReservePx,
  valueSigns,
  verticalValueLabelsFit,
} from './chart-layout'
import { fitCategoryLabels, measureCharPx } from './label-fit'
import { makeCategoryTick } from './category-tick'
import { useCategoryTicks } from './use-category-ticks'
import { ChartEmpty } from './chart-empty'

/** recharts' own default cartesian margin, which this chart keeps as its base. */
const DEFAULT_MARGIN_PX = 5

/**
 * Bar chart over the emitted ChartBlock shape.
 *
 * Each entry in `series` becomes one set of bars, indexed-colored.
 * `options.stacked` stacks them; `options.orientation = "vertical"`
 * renders horizontal bars (category on the Y axis).
 *
 * Whichever axis carries the values is drawn and anchored at zero
 * (BAR_VALUE_DOMAIN): a bar reads as a length, so a floating baseline
 * overstates small differences.
 *
 * Everything about density — orientation, band height, which labels print, how
 * they are truncated, whether the number sits on the bar — comes from the
 * Chart Legibility Policy in chart-layout.ts. The block computes that plan
 * (it also slices `data` to match) and hands it down; a chart rendered without
 * a block computes its own from the inline defaults.
 */
export function BarChart({
  data,
  x,
  series,
  options,
  mode = 'inline',
  width = DEFAULT_CHART_WIDTH_PX,
  chartType = 'bar',
  plan,
}: ChartProps) {
  const stacked = options?.stacked ?? false
  const seriesCount = series.length
  const charPx = measureCharPx()

  const resolved = useMemo(
    () =>
      plan ??
      planBarLayout({
        chartType,
        xValues: data.map((row) => row[x.key]),
        orientation: options?.orientation,
        width,
        mode,
        seriesCount,
        stacked,
        charPx,
      }),
    [plan, chartType, data, x.key, options?.orientation, width, mode, seriesCount, stacked, charPx],
  )

  const { horizontal, flipped, categories, layout } = resolved
  const plotWidth = Math.max(1, width - VALUE_AXIS_ESTIMATE_PX)

  // A vertical bar chart runs its categories along the x axis, exactly like a
  // line or an area, so it asks the same hook they do. (Called unconditionally
  // — hooks must be — and unused on the horizontal path, which budgets from the
  // axis COLUMN instead: a different, much wider number for the same chart.)
  const verticalTicks = useCategoryTicks({ data, xKey: x.key, plotWidth, charPx })

  // Fit the whole visible set together: that is what keeps "Variant #12" and
  // "Variant #13" from both printing as "Variant #1…".
  const horizontalTicks = useMemo(() => {
    const maxChars = layout.maxChars
    const labels = fitCategoryLabels(categories, maxChars)
    const fitted = new Map<string, string>()
    categories.forEach((raw, index) => {
      if (!fitted.has(raw)) fitted.set(raw, labels[index])
    })
    return {
      // Two lines need a tall band, so only a horizontal chart can offer them.
      tick: makeCategoryTick({ fitted, maxChars, allowWrap: layout.bandPx >= BAND_PX }),
      tickFormatter: (value: unknown) => {
        const raw = String(value ?? '')
        return fitted.get(raw) ?? raw
      },
    }
  }, [categories, layout.maxChars, layout.bandPx])

  const valueLabel = useMemo(() => makeValueLabel(horizontal), [horizontal])

  const seriesKeys = useMemo(() => series.map((field) => field.key), [series])
  const signs = useMemo(() => valueSigns(data, seriesKeys), [data, seriesKeys])
  const mixedSigns = signs.positive && signs.negative

  // Both the band-width test and the margin reserve are sized from the text
  // that will actually print, not from an assumed maximum.
  const longestValueChars = useMemo(() => {
    let longest = 0
    for (const row of data) {
      for (const key of seriesKeys) {
        const value = row[key]
        if (value === null || value === undefined || value === '') continue
        if (!Number.isFinite(Number(value))) continue
        longest = Math.max(longest, formatAxisTick(value).length)
      }
    }
    return longest
  }, [data, seriesKeys])

  if (!data.length || !x.key || seriesCount === 0) {
    return <ChartEmpty />
  }

  const showLegend = shouldShowLegend(seriesCount, options?.showLegend)
  const seriesLabels = series.map((s) => s.label).join(', ')
  const showValueLabels =
    layout.showValueLabels &&
    (horizontal ||
      verticalValueLabelsFit(plotWidth, data.length * seriesCount, longestValueChars, charPx))

  // Reserve the room the labels hang in. Without it the LONGEST bar — the one
  // the reader came for — is the one whose number gets clipped by the plot edge.
  const reserve = showValueLabels ? valueLabelReservePx(longestValueChars, charPx) : 0
  const chartMargin = {
    top: !horizontal && reserve > 0 ? DEFAULT_MARGIN_PX + VALUE_LABEL_LINE_PX : DEFAULT_MARGIN_PX,
    right: horizontal && signs.positive ? DEFAULT_MARGIN_PX + reserve : DEFAULT_MARGIN_PX,
    bottom: DEFAULT_MARGIN_PX,
    // Negative bars grow leftwards, so their labels need the room on that side.
    left: horizontal && signs.negative ? DEFAULT_MARGIN_PX + reserve : DEFAULT_MARGIN_PX,
  }
  const categoryAxis = {
    ...CHART_Y_AXIS,
    dataKey: x.key,
    ...(horizontal ? horizontalTicks : { tick: verticalTicks.tick, tickFormatter: verticalTicks.tickFormatter }),
  }

  return (
    <div
      className="h-full w-full min-w-0"
      // Diagnostics: the reader asked for vertical bars and got horizontal ones.
      data-cxc-layout={flipped ? 'flipped' : undefined}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={CHART_INITIAL_DIMENSION}
        // A tall expanded chart re-lays out on every scrollbar-driven resize.
        debounce={mode === 'expanded' ? 50 : 0}
      >
        <RechartsBarChart
          data={data}
          margin={chartMargin}
          layout={horizontal ? 'vertical' : 'horizontal'}
          accessibilityLayer
          aria-label={`Bar chart of ${seriesLabels} by ${x.label}`}
        >
          <CartesianGrid {...CHART_GRID_STYLE} />

          {horizontal ? (
            <>
              <XAxis
                {...CHART_X_AXIS}
                type="number"
                domain={BAR_VALUE_DOMAIN}
                tickFormatter={formatAxisTick}
                // The expanded list scrolls, so a bottom axis is off-screen for
                // every row the reader is actually looking at.
                orientation={mode === 'expanded' ? 'top' : 'bottom'}
              />
              <YAxis
                {...categoryAxis}
                type="category"
                width={layout.axisWidth}
                interval={layout.interval}
              />
            </>
          ) : (
            <>
              <XAxis {...categoryAxis} interval={verticalTicks.interval} />
              <YAxis
                {...CHART_Y_AXIS}
                type="number"
                width="auto"
                domain={BAR_VALUE_DOMAIN}
                tickFormatter={formatAxisTick}
              />
            </>
          )}

          <Tooltip
            cursor={false}
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={formatTooltipValue}
            labelFormatter={verticalTicks.tooltipLabelFormatter}
          />

          {showLegend && <Legend {...chartLegendProps()} />}

          {/* One series colour on both sides of zero: colouring by sign would be
              a semantic claim ("bad") the client palette cannot make. */}
          {mixedSigns && <ReferenceLine {...(horizontal ? { x: 0 } : { y: 0 })} {...CHART_ZERO_LINE_STYLE} />}

          {series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={getChartColor(index)}
              radius={4}
              stackId={stacked ? 'stack' : undefined}
              // A 1K bar beside a 1.2M bar rounds to nothing. A 2px sliver is
              // honest because the value label prints the number beside it.
              minPointSize={2}
              isAnimationActive={layout.animate}
              animationDuration={CHART_ANIMATION.duration}
              animationEasing={CHART_ANIMATION.easing}
            >
              {showValueLabels && <LabelList dataKey={s.key} content={valueLabel} />}
            </Bar>
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------------------------- Value label ----------------------------- */

interface BarRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * recharts' viewBox as a normalised rectangle, or null when it is not one.
 *
 * Two traps. The viewBox is a union (cartesian/polar), so it is only a rect
 * when it carries all four numbers. And a NEGATIVE bar arrives with its x at
 * the zero baseline and a negative width — the SVG path is normalised when it
 * is drawn, the viewBox is not. Reading it raw put every negative value label
 * on the zero line, on top of the next bar (browser-verified, 2026-08-29).
 */
function toBarRect(viewBox: unknown): BarRect | null {
  if (!viewBox || typeof viewBox !== 'object') return null
  const { x, y, width, height } = viewBox as Partial<BarRect>
  if (![x, y, width, height].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null
  }
  const [left, w] = normalize(x as number, width as number)
  const [top, h] = normalize(y as number, height as number)
  return { x: left, y: top, width: w, height: h }
}

/** Move a negative extent onto its own origin, so x is always the left edge. */
function normalize(origin: number, extent: number): [number, number] {
  return extent < 0 ? [origin + extent, -extent] : [origin, extent]
}

/**
 * The number, printed on the bar.
 *
 * A touch device has no hover, so without this the reader gets no figure at all
 * — and with one bar at -1.2M every other bar is a sliver whose length says
 * nothing. Anchored by sign (see valueLabelAnchor): recharts positions labels
 * relative to the bar rectangle, so a negative bar's "right" edge is the zero
 * line, on top of its neighbour.
 */
function makeValueLabel(horizontal: boolean) {
  return function BarValueLabel(props: LabelProps) {
    const rect = toBarRect(props.viewBox)
    const raw = props.value
    const value = typeof raw === 'number' ? raw : Number(raw)
    if (!rect || !Number.isFinite(value)) return <></>

    const anchor = valueLabelAnchor(value)

    if (!horizontal) {
      // Vertical bars: the outer end is the top for a positive bar and the
      // bottom for a negative one, and the label centres over the column.
      const above = value < 0
      return (
        <text
          x={rect.x + rect.width / 2}
          y={above ? rect.y + rect.height : rect.y}
          dy={above ? '1em' : '-0.4em'}
          textAnchor="middle"
          {...CHART_VALUE_LABEL_STYLE}
        >
          {formatAxisTick(value)}
        </text>
      )
    }

    const edge = anchor.side === 'end' ? rect.x + rect.width : rect.x
    return (
      <text
        x={edge + anchor.dx}
        y={rect.y + rect.height / 2}
        dy="0.32em"
        textAnchor={anchor.textAnchor}
        {...CHART_VALUE_LABEL_STYLE}
      >
        {formatAxisTick(value)}
      </text>
    )
  }
}
