import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { Legend, type DefaultLegendContentProps } from 'recharts'
import { cn } from '../../utils/cn'
import { chartLegendProps } from './chart-helpers'

const LegendPortal = createContext<HTMLElement | null>(null)

/**
 * Keep the plot's height independent of the number of wrapped legend rows.
 * Layout lives in Tailwind classes, not in styles.css: an AuiView host such as
 * the FDE console loads no library CSS. The `cxc-chart-*` names are hooks only.
 */
export function ChartFrame({ children, style }: { children: ReactNode; style: CSSProperties }) {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  return (
    <LegendPortal.Provider value={portal}>
      <div className="cxc-chart-plot w-full min-w-0" style={style}>{children}</div>
      <div ref={setPortal} className="cxc-chart-legend" />
    </LegendPortal.Provider>
  )
}

export function ChartLegend({ round = false }: { round?: boolean }) {
  const portal = useContext(LegendPortal)
  return (
    <Legend
      {...chartLegendProps()}
      portal={portal ?? undefined}
      verticalAlign="bottom"
      content={<LegendItems round={round} />}
    />
  )
}

function LegendItems({ payload, round }: DefaultLegendContentProps & { round: boolean }) {
  return (
    <ul
      className="cxc-chart-legend-items m-0 flex list-none flex-wrap justify-center gap-x-[14px] gap-y-[6px] p-0 pt-2 text-xs leading-normal"
      style={{ color: 'var(--cxc-text-secondary)' }}
      aria-label="Chart legend"
    >
      {payload?.filter(entry => entry.type !== 'none').map((entry, index) => (
        <li key={`${entry.dataKey ?? entry.value}-${index}`} className="cxc-chart-legend-item flex min-w-0 max-w-full items-start gap-1.5">
          <span
            className={cn('cxc-chart-legend-swatch w-2.5 flex-none', swatchShape(round ? 'circle' : entry.type))}
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span className="cxc-chart-legend-label min-w-0 [overflow-wrap:anywhere]">{entry.value}</span>
        </li>
      ))}
    </ul>
  )
}

/** The swatch follows the series mark: a dot, a short line, or a square. */
function swatchShape(type: string | undefined): string {
  if (type === 'circle') return 'mt-1 h-2.5 rounded-full'
  if (type === 'line' || type === 'plainline') return 'mt-2 h-0.5'
  return 'mt-1 h-2.5'
}
