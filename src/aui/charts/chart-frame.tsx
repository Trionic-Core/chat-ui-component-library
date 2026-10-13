import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { Legend, type DefaultLegendContentProps } from 'recharts'
import { chartLegendProps } from './chart-helpers'

const LegendPortal = createContext<HTMLElement | null>(null)

/** Keep the plot's height independent of the number of wrapped legend rows. */
export function ChartFrame({ children, style }: { children: ReactNode; style: CSSProperties }) {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)
  return (
    <LegendPortal.Provider value={portal}>
      <div className="cxc-chart-plot" style={style}>{children}</div>
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
    <ul className="cxc-chart-legend-items" aria-label="Chart legend">
      {payload?.filter(entry => entry.type !== 'none').map((entry, index) => (
        <li key={`${entry.dataKey ?? entry.value}-${index}`} className="cxc-chart-legend-item">
          <span
            className="cxc-chart-legend-swatch"
            data-shape={round || entry.type === 'circle' ? 'circle' : entry.type}
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span className="cxc-chart-legend-label">{entry.value}</span>
        </li>
      ))}
    </ul>
  )
}
