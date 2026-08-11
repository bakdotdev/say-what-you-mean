/**
 * Adaptive workspace shell.
 *
 * Empty columns are not rendered at all, so the remaining ones absorb the
 * space instead of leaving a gap: a view with no right-hand panels becomes a
 * comfortable two-column layout, and one with only a centre becomes a single
 * readable column.
 *
 * Flex rather than grid precisely because absent children then cost nothing —
 * no template juggling. Stacks to one column below `lg`.
 */
import { Children, isValidElement, type ReactNode } from "react"

const FRAGMENT = Symbol.for("react.fragment")

/** Treats null/false/empty fragments (and arrays of those) as "nothing". */
const hasContent = (node: ReactNode): boolean => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return false
  }
  if (typeof node === "string") return node.trim().length > 0
  if (typeof node === "number") return true
  if (Array.isArray(node)) return node.some(hasContent)
  if (isValidElement(node)) {
    if (node.type === FRAGMENT) {
      return hasContent((node.props as { children?: ReactNode })?.children)
    }
    return true
  }
  return Children.count(node) > 0
}

export function Columns({
  left,
  center,
  right,
}: {
  left?: ReactNode
  center: ReactNode
  right?: ReactNode
}) {
  const showLeft = hasContent(left)
  const showRight = hasContent(right)

  return (
    <div className="flex flex-col items-start gap-3 lg:flex-row">
      {showLeft && (
        <div className="w-full space-y-3 lg:w-60 lg:shrink-0">{left}</div>
      )}
      {/* min-w-0 so long words and wide panels cannot force overflow. */}
      <div className="w-full min-w-0 flex-1 space-y-3">{center}</div>
      {showRight && (
        <div className="w-full space-y-3 lg:w-80 lg:shrink-0">{right}</div>
      )}
    </div>
  )
}
