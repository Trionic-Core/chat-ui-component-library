import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

/* ------------------------------------------------------------------
 * Table primitives — themed table parts for the AUI table block.
 *
 * Ported from the fde-console primitive, re-themed onto the library's
 * token system (cx-* bridges to cxc-*) so headers/rows/dividers read
 * correctly in both light and dark.
 * ----------------------------------------------------------------*/

export function Table({ className, style, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn('min-w-full', className)}
        style={{ borderCollapse: 'collapse', ...style }}
        {...props}
      />
    </div>
  )
}

export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}

export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

export function Tr({ style, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr style={{ borderTop: '1px solid var(--cx-border-subtle)', ...style }} {...props} />
}

export function Th({ className, style, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider',
        className,
      )}
      style={{ color: 'var(--cx-text-muted)', backgroundColor: 'var(--cx-canvas-subtle)', ...style }}
      {...props}
    />
  )
}

export function Td({ className, style, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('whitespace-nowrap px-4 py-3 text-sm', className)}
      style={{ color: 'var(--cx-text-secondary)', ...style }}
      {...props}
    />
  )
}
