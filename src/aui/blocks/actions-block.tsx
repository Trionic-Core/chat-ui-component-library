import { Button } from '../ui/button'
import type { ActionsBlock as ActionsBlockType, ActionItem } from '../aui-types'

/* ------------------------------------------------------------------
 * Actions Block
 *
 * A row of buttons that drive the action loop: clicking sends the
 * action's send_message as a new chat turn (reuses the existing
 * provider send path).
 * ----------------------------------------------------------------*/

interface ActionsBlockProps {
  block: ActionsBlockType
  onSendMessage: (message: string) => void
}

export function ActionsBlock({ block, onSendMessage }: ActionsBlockProps) {
  if (block.actions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {block.actions.map((action) => (
        <ActionButton key={action.id} action={action} onSendMessage={onSendMessage} />
      ))}
    </div>
  )
}

function ActionButton({
  action,
  onSendMessage,
}: {
  action: ActionItem
  onSendMessage: (message: string) => void
}) {
  return (
    <Button
      size="sm"
      variant={action.style === 'primary' ? 'primary' : 'secondary'}
      onClick={() => onSendMessage(action.on_click.send_message)}
    >
      {action.label}
    </Button>
  )
}
