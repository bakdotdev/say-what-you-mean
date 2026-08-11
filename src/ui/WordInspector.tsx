/** Shows why a clicked carrier word fits or doesn't: its per-method equations. */
import { useEffect, useState } from "react"
import {
  equationsFor,
  FEATURE_METHODS,
  type Encoder,
  type Equation,
  type WordReport,
} from "../codec"
import { Tag } from "./primitives"

export function WordInspector({
  report,
  encoder,
  onClose,
}: {
  report: WordReport
  encoder: Encoder
  onClose: () => void
}) {
  const [equations, setEquations] = useState<Equation[] | null>(null)

  useEffect(() => {
    let cancelled = false
    encoder.digestsFor(report.word).then((fd) => {
      if (!cancelled) {
        setEquations(equationsFor(fd, encoder.B, encoder.density))
      }
    })
    return () => {
      cancelled = true
    }
  }, [report.word, encoder])

  const labelFor = (methodId: string) =>
    FEATURE_METHODS.find((m) => m.id === methodId)

  return (
    <div className="rounded-lg border border-edge bg-panel-2 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold">“{report.word}”</span>
          <Tag tone={report.green ? "green" : "red"}>
            {report.satisfied}/{report.total} fit
          </Tag>
        </div>
        <button
          onClick={onClose}
          className="text-muted hover:text-fg"
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>

      {equations ? (
        <div className="space-y-2 text-muted">
          <p>
            This word speaks about the message through{" "}
            {equations.length} independent{" "}
            {equations.length === 1 ? "reading" : "readings"}:
          </p>
          <ul className="space-y-1">
            {equations.map((eq, i) => {
              const method = labelFor(eq.methodId)
              return (
                <li key={i} className="font-mono text-xs">
                  <span className="text-fg">{method?.label ?? eq.methodId}</span>{" "}
                  <span className="text-muted">({method?.describe})</span> → bits{" "}
                  <span className="text-fg">{eq.subset.join(", ")}</span> ⊕ ={" "}
                  <span className="text-fg">{eq.parity}</span>
                </li>
              )
            })}
          </ul>
          <p>
            {report.green
              ? "All of these agree with the hidden message, so the word is usable."
              : "At least one disagrees with the hidden message — pick a different word."}
          </p>
        </div>
      ) : (
        <p className="text-muted">Computing…</p>
      )}
    </div>
  )
}
