/** Short readme, one per version. */

const REPO = "https://github.com/bakdotdev/say-what-you-mean"

function Source() {
  return (
    <p className="border-t border-edge pt-2 text-fg-dim">
      //{" "}
      <a
        href={REPO}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-edge underline-offset-2 transition-colors hover:text-accent"
      >
        read the source
      </a>
    </p>
  )
}

export function About({ version = "v1" }: { version?: "v1" | "v2" }) {
  return (
    <details className="border border-edge bg-panel text-[11px] leading-relaxed tracking-wider text-muted">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        readme
      </summary>
      <div className="space-y-2 border-t border-edge px-3 py-3">
        {version === "v1" ? (
          <>
            <p className="text-fg-dim">// how it works</p>
            <p>
              // the message is encoded into the words of the paragraph itself.
              your passphrase turns every word into an equation about it —
              hmac(key, word) — so the paragraph is the ciphertext. there is no
              key, and nothing is stored anywhere.
            </p>
            <p>
              // the whole paragraph is treated as one codeword and solved for
              the smallest set of words that must change to make every equation
              hold. this is syndrome coding, after westfeld's f5 and fridrich.
              on a real 117-word paragraph it cut the words needing changes from
              92 to 30.
            </p>
            <p>
              // words you lock are routed around, using wet paper codes: the
              encoder avoids them and the reader never needs to know which ones
              you locked. words like "the" and "of" never carry, because you
              cannot swap them for a synonym.
            </p>
            <p className="text-fg-dim">// the two modes</p>
            <p>
              // COMPACT is matrix embedding: the shortest carrier, but the
              maths depends on every word in order, so any edit breaks it.
            </p>
            <p>
              // DURABLE gives each word a clue that depends only on itself, and
              a fountain code fills the gaps. a deleted word is a clean gap
              rather than a wrong answer, so the rest still decodes — tested
              surviving sixty deleted words. it costs roughly double the length.
            </p>
            <p className="text-fg-dim">// technology</p>
            <p>
              // pbkdf2-sha256 at 300k iterations, hkdf split into addressing,
              keystream and mac, hmac-sha256 per word, gf(2) linear algebra and
              a fountain code. all web crypto, all in your browser.
            </p>
            <p className="text-fg-dim">// limits</p>
            <ul className="space-y-1">
              <li>— a lab experiment, not a secure channel</li>
              <li>— up to 16 characters</li>
              <li>— case, spacing and punctuation survive; word edits do not</li>
              <li>
                — durable mode needs ~750 words for a 9-character secret, and
                about one word in eight is chosen by the maths rather than by
                meaning. v3 is the answer to that
              </li>
              <li>— runs in your browser; the secret never leaves it</li>
            </ul>
            <Source />
          </>
        ) : (
          <>
            <p className="text-fg-dim">// how it works</p>
            <p>
              // your paragraph is never modified — not one word. it is not the
              ciphertext here; it is one of three things needed to read the
              message.
            </p>
            <p>
              // a pad is derived from your passphrase and the words themselves,
              and the message is encrypted against it. pad = hkdf(passphrase,
              digest of the words), key = secret xor pad. no search, no word
              changes — it is solved directly.
            </p>
            <p>
              // the encrypted result is held in escrow under an id that cannot
              be reversed, and destroyed the first time it is read. so nothing
              travels alongside the text.
            </p>
            <p>
              // the text, the passphrase and that one read must all meet.
              change a word and it is gone.
            </p>
            <p className="text-fg-dim">// technology</p>
            <p>
              // pbkdf2-sha256, hkdf, hmac-sha256 and a private blob store for
              the burn-after-reading escrow. the encryption happens in your
              browser.
            </p>
            <p className="text-fg-dim">// limits</p>
            <ul className="space-y-1">
              <li>— a lab experiment, not a secure channel</li>
              <li>— up to 16 characters</li>
              <li>— case, spacing and punctuation survive; word edits do not</li>
              <li>
                — this binds a message to a text; it does not hide that a
                message exists. the content rides in the key, not in the words
              </li>
              <li>— the escrow holds the encrypted message, never your passphrase</li>
            </ul>
            <Source />
          </>
        )}
      </div>
    </details>
  )
}
