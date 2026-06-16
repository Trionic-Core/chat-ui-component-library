import { type ButtonHTMLAttributes, type CSSProperties, forwardRef } from 'react'
import { cn } from '../../utils/cn'

/* ------------------------------------------------------------------
 * Button — themed action button for AUI actions blocks.
 *
 * Ported from the fde-console primitive. The fde version baked in
 * brand/gray Tailwind colors; here it reads the library's token system
 * (cx-* bridges to cxc-*) via inline style so primary/secondary track
 * the active theme. Only the two variants the actions block uses
 * (primary, secondary) are kept — the fde ghost/danger variants are
 * unused on this surface.
 * ----------------------------------------------------------------*/

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-4 py-2.5 text-sm',
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    backgroundColor: 'var(--cx-accent)',
    color: 'var(--cxc-text-inverse)',
    border: '1px solid var(--cx-accent)',
    boxShadow: 'var(--cxc-shadow-sm)',
  },
  secondary: {
    backgroundColor: 'var(--cx-canvas)',
    color: 'var(--cx-text-secondary)',
    border: '1px solid var(--cx-border)',
    boxShadow: 'var(--cxc-shadow-sm)',
  },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, style, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          sizeClasses[size],
          className,
        )}
        style={{ ...variantStyles[variant], ...style }}
        {...props}
      />
    )
  },
)

Button.displayName = 'AuiButton'
