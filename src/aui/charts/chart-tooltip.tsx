import type { ComponentProps } from 'react'
import { Tooltip, usePlotArea } from 'recharts'

/** Recharts positions tooltips inside the plot, which excludes axis widths. */
export function ChartTooltip(props: ComponentProps<typeof Tooltip>) {
  const plot = usePlotArea()
  return (
    <Tooltip
      {...props}
      wrapperStyle={{
        ...props.wrapperStyle,
        maxWidth: Math.min(280, Math.max(1, plot?.width ?? 280)),
      }}
    />
  )
}
