import type { BaseTickContentProps } from 'recharts'
import { CHART_Y_AXIS } from '../chart-theme'
import { wrapLabel } from './label-fit'

/* ------------------------------------------------------------------
 * Category axis tick — one renderer for every cartesian chart.
 *
 * recharts' default tick prints whatever tickFormatter returned and offers the
 * reader nothing else, so a truncated label used to be the end of the road.
 * This one prints the FITTED label, carries the full one in a <title>, and
 * takes a second line when the whole label fits in two.
 * ----------------------------------------------------------------*/

/** Baseline offset for the vertical anchor recharts asks for, in em. */
const BASELINE_DY: Record<string, string> = {
  start: '0.71em',
  middle: '0.32em',
  end: '-0.3em',
}

/** Leading between two wrapped tick lines, in em. */
const LINE_DY = '1.1em'
/** Half a line up, so a two-line label straddles the band centre. */
const WRAPPED_FIRST_DY = '-0.25em'

export interface CategoryTickOptions {
  /** Fitted label by raw category value, fitted as a SET (see label-fit). */
  fitted: Map<string, string>
  maxChars: number
  /**
   * Allow a second line. Only a horizontal bar chart has the band height for
   * one; under a vertical axis a second line would collide with the plot.
   */
  allowWrap: boolean
}

/** Build the `tick` render function for a category axis. */
export function makeCategoryTick({ fitted, maxChars, allowWrap }: CategoryTickOptions) {
  return function CategoryTick(props: BaseTickContentProps) {
    const raw = String(props.payload?.value ?? '')
    const x = Number(props.x)
    const y = Number(props.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    const lines = allowWrap ? wrapLabel(raw, maxChars) : null
    const printed = lines ?? [fitted.get(raw) ?? raw]
    const firstDy = lines ? WRAPPED_FIRST_DY : (BASELINE_DY[props.verticalAnchor] ?? BASELINE_DY.middle)

    return (
      <text
        // recharts tags every tick with recharts-cartesian-axis-tick-value and
        // then measures those nodes to auto-size an axis. Dropping the class
        // would make a custom tick invisible to its own chart engine.
        className={props.className}
        x={x}
        y={y}
        fill={props.fill ?? CHART_Y_AXIS.stroke}
        fontSize={CHART_Y_AXIS.fontSize}
        fontFamily={CHART_Y_AXIS.fontFamily}
        textAnchor={props.textAnchor}
      >
        <title>{raw}</title>
        {printed.map((line, index) => (
          <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? firstDy : LINE_DY}>
            {line}
          </tspan>
        ))}
      </text>
    )
  }
}
