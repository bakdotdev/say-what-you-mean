/** Terminal-style primitives: monospace, amber, square edges. */
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
        "inline-flex items-center justify-center gap-2 border px-3 py-1.5 text-xs uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-30",
        variant === "solid"
          ? "border-accent bg-accent/10 text-accent hover:bg-accent/20"
          : "border-edge bg-transparent text-muted hover:border-fg-dim hover:text-fg",
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
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {hint && (
          <span className="text-[10px] tracking-wider text-muted">{hint}</span>
        )}
      </div>
      {children}
    </label>
  )
}

const inputBase =
  "w-full border border-edge bg-panel px-2.5 py-1.5 text-fg caret-accent outline-none placeholder:text-muted/60 focus:border-accent"

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, props.className)} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(inputBase, "resize-y leading-relaxed", props.className)}
    />
  )
}

/** Blocky segmented meter, like a load bar. */
export function Meter({
  value,
  max,
  tone = "accent",
  segments = 40,
}: {
  value: number
  max: number
  tone?: "accent" | "green"
  segments?: number
}) {
  const pct = max <= 0 ? 0 : Math.min(1, value / max)
  const filled = Math.round(pct * segments)
  const color = tone === "green" ? "bg-accent" : "bg-accent/70"
  return (
    <div
      className="flex gap-[2px]"
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cx(
            "h-2.5 flex-1 transition-colors",
            i < filled ? color : "bg-faint/40",
          )}
        />
      ))}
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
        "inline-flex items-center border px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
        // One hue; state reads through opacity and fill weight.
        tone === "green" && "border-fg bg-accent/20 text-fg",
        tone === "red" && "border-faint bg-transparent text-muted",
        tone === "muted" && "border-edge bg-panel-2 text-muted",
      )}
    >
      {children}
    </span>
  )
}

/** Section frame with a bracketed title, like a TUI panel. */
export function Panel({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border border-edge bg-panel">
      <header className="flex items-center justify-between border-b border-edge px-3 py-1.5">
        <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-dim">
          {title}
        </h2>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}
