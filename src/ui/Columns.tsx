/** Three-column workspace shell. Stacks on narrow viewports. */
import type { ReactNode } from "react"

export function Columns({
  left,
  center,
  right,
}: {
  left: ReactNode
  center: ReactNode
  right: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
      <div className="space-y-3">{left}</div>
      <div className="space-y-3">{center}</div>
      <div className="space-y-3">{right}</div>
    </div>
  )
}
