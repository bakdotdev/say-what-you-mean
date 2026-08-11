/** Short readme, one per version. */

export function About({ version = "v1" }: { version?: "v1" | "v2" }) {
  return (
    <details className="border border-edge bg-panel text-[11px] leading-relaxed tracking-wider text-muted">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        readme
      </summary>
      <div className="space-y-2 border-t border-edge px-3 py-3">
        {version === "v1" ? (
          <>
            <p>
              // every word already says something about the message, via a
              keyed hash of itself. the whole paragraph is treated as one
              codeword, so only the fewest possible words change.
            </p>
            <p>
              // you send just the text. nothing else travels with it.
            </p>
          </>
        ) : (
          <>
            <p>
              // your paragraph is never modified. the key is derived from your
              passphrase and the words themselves, held in escrow, and deleted
              the first time it is read.
            </p>
            <p>
              // you send just the text. your recipient needs only that and the
              passphrase.
            </p>
          </>
        )}
        <p className="text-fg-dim">// limits</p>
        <ul className="space-y-1">
          <li>— a lab experiment, not a secure channel</li>
          <li>— up to 16 characters</li>
          <li>— case, spacing and punctuation survive; word edits do not</li>
          <li>— runs in your browser; the secret never leaves it</li>
        </ul>
      </div>
    </details>
  )
}
