import { Component, type ErrorInfo, type ReactNode } from 'react'

/* ------------------------------------------------------------------
 * Per-block error boundary
 *
 * Isolates a single AUI block: a render-time exception in one block
 * never breaks the rest of the message. A class component is the only
 * way to catch render errors in React, hence the exception to the
 * function-component convention.
 * ----------------------------------------------------------------*/

interface BlockErrorBoundaryProps {
  /** Block type, used only for the diagnostic log. */
  blockType: string
  children: ReactNode
}

interface BlockErrorBoundaryState {
  hasError: boolean
}

export class BlockErrorBoundary extends Component<
  BlockErrorBoundaryProps,
  BlockErrorBoundaryState
> {
  state: BlockErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): BlockErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[aui] block "${this.props.blockType}" failed to render:`, error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: 'var(--cx-border)',
            color: 'var(--cx-text-muted)',
          }}
          role="status"
        >
          This block could not be displayed.
        </div>
      )
    }
    return this.props.children
  }
}
