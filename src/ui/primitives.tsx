/** Small local UI primitives styled for the dark lab theme. */
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react"

const cx = (...parts: (string | false | undefined)[]): string =>
  parts.filter(Boolean).join(" ")

export function Button({
  className,
  variant = "solid",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost"
}) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "solid"
          ? "bg-accent text-white hover:bg-accent/85"
          : "border border-edge bg-panel-2 text-fg hover:border-muted",
        className,
      )}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-fg">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-fg outline-none placeholder:text-muted focus:border-accent",
        props.className,
      )}
    />
  )
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "w-full resize-y rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-sm leading-relaxed text-fg outline-none placeholder:text-muted focus:border-accent",
        props.className,
      )}
    />
  )
}

export function Meter({
  value,
  max,
  tone = "accent",
}: {
  value: number
  max: number
  tone?: "accent" | "green"
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-panel-2"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-200",
          tone === "green" ? "bg-green" : "bg-accent",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode
  tone?: "muted" | "green" | "red"
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "green" && "bg-green/15 text-green",
        tone === "red" && "bg-red/15 text-red",
        tone === "muted" && "bg-panel-2 text-muted",
      )}
    >
      {children}
    </span>
  )
}
