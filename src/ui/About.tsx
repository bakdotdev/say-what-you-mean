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
              // the message is encoded into the words of the paragraph itself.
              your passphrase turns each word into a clue about it, so the
              paragraph is the ciphertext — there is no key, and nothing is
              stored anywhere.
            </p>
            <p>
              // the whole paragraph is treated as one codeword, so only the
              fewest possible words have to change.
            </p>
            <p>
              // you send just the text. your recipient needs that and the
              passphrase you agreed on beforehand, and nothing else.
            </p>
          </>
        ) : (
          <>
            <p>
              // your paragraph is never modified — not one word. it is not the
              ciphertext here; it is one of the three things needed to read the
              message.
            </p>
            <p>
              // the message is encrypted against a pad derived from your
              passphrase and the words themselves. the result is held in escrow
              and destroyed the first time it is read, so nothing travels
              alongside the text.
            </p>
            <p>
              // the text, the passphrase and that one read must all meet.
              change a word and it is gone.
            </p>
          </>
        )}
        <p className="text-fg-dim">// limits</p>
        <ul className="space-y-1">
          <li>— a lab experiment, not a secure channel</li>
          <li>— up to 16 characters</li>
          <li>— case, spacing and punctuation survive; word edits do not</li>
          <li>
            {version === "v1"
              ? "— runs in your browser; the secret never leaves it"
              : "— the escrow holds the encrypted message, never your passphrase"}
          </li>
        </ul>
      </div>
    </details>
  )
}
