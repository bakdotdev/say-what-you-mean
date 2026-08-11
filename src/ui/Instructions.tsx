/** Short how-to. Sits above the readme, which carries the deeper detail. */
export function Instructions({ durable }: { durable: boolean }) {
  return (
    <details className="border border-edge bg-panel text-[11px] leading-relaxed tracking-wider text-muted">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        how to use
      </summary>
      <ol className="list-inside list-decimal space-y-1.5 border-t border-edge px-3 py-3">
        <li>Enter a short secret and a passphrase you both know.</li>
        <li>
          Write or paste a paragraph, or press{" "}
          <span className="text-fg-dim">generate a carrier for me</span>.
        </li>
        <li>
          Change the highlighted words. Only they matter
          {durable ? " — about one word in three." : "."} Everything unmarked
          is yours to write freely.
        </li>
        <li>
          Click a word to lock it if it must stay exactly as written; the
          solver will leave it alone.
        </li>
        <li>Copy the text and send it. The passphrase goes separately.</li>
      </ol>
    </details>
  )
}
