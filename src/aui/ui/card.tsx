import type { HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

/* ------------------------------------------------------------------
 * Card — themed container for AUI blocks.
 *
 * Ported from the fde-console primitive, re-themed onto the library's
 * token system (cx-* bridges to the native cxc-* tokens) so cards read
 * correctly in both light and dark.
 * ----------------------------------------------------------------*/

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingClasses: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export function Card({ padding = 'md', className, style, children, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-lg border', paddingClasses[padding], className)}
      style={{
        borderColor: 'var(--cx-border)',
        backgroundColor: 'var(--cx-canvas)',
        boxShadow: 'var(--cxc-shadow-sm)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
