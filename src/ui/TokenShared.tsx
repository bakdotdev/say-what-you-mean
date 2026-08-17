/** Pieces both v3 views need. */
import { Panel, Tag } from "./primitives"
import type { ModelState } from "./useTokenModel"

/**
 * The model download is the honest cost of v3 and both sides pay it, so it
 * gets its own panel rather than hiding behind a spinner.
 */
export function ModelPanel({ model }: { model: ModelState }) {
  const pct = model.progress === null ? null : Math.round(model.progress * 100)
  return (
    <Panel
      title="model"
      right={
        <Tag tone={model.ready ? "green" : undefined}>
          {model.ready ? "loaded" : model.loading ? "loading" : "not loaded"}
        </Tag>
      }
    >
      <p className="text-[10px] leading-relaxed tracking-wider text-muted">
        runs in your browser. about 145 mb the first time, then cached. your
        recipient needs it too.
      </p>
      {model.loading && (
        <div className="mt-2">
          <div className="h-1 w-full bg-panel-2">
            <div
              className="h-1 bg-accent transition-[width] duration-200"
              style={{ width: `${pct ?? 5}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] tracking-wider text-muted">
            {pct === null ? "starting…" : `${pct}%`}
          </p>
        </div>
      )}
      {model.error && (
        <p className="mt-2 text-[10px] leading-relaxed tracking-wider text-fg">
          {model.error}
        </p>
      )}
    </Panel>
  )
}

/** Readme for v3. */
const REPO = "https://github.com/bakdotdev/say-what-you-mean"

export function TokenAbout() {
  return (
    <details className="border border-edge bg-panel text-[11px] leading-relaxed tracking-wider text-muted">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-fg-dim">
        readme
      </summary>
      <div className="space-y-2 border-t border-edge px-3 py-3">
        <p className="text-fg-dim">// how it works</p>
        <p>
          // v1 writes a paragraph and then swaps words until the maths works,
          which is why so much of it reads oddly. this turns that around.
        </p>
        <p>
          // a language model writes the message one word at a time. at each
          step it has a range of words it might pick next, with a likelihood for
          each; your secret decides which one it takes. every word is one the
          model would plausibly have written, so nothing has to be swapped
          afterwards and the text reads as written.
        </p>
        <p>
          // reading it back runs the same model over the same words and works
          out which choice was made each time. that needs the model to behave
          identically at both ends, which is why it runs here rather than on a
          server — no api promises the same numbers twice.
        </p>
        <p>
          // the choice is huffman-coded, so likely words cost fewer bits and
          get picked more often. choosing evenly made half the words improbable
          ones, and it read like it.
        </p>
        <p>
          // the passphrase also chooses what the message is about and how it
          opens, so you send nothing but the text.
        </p>
        <p className="text-fg-dim">// technology</p>
        <p>
          // smollm2-135m-instruct, quantized, run in your browser through
          transformers.js and onnxruntime-web. the payload is keyed the same way
          as v1 — pbkdf2-sha256, hkdf, a 16-bit mac — so a wrong passphrase
          returns nothing rather than nonsense. about 4.4 bits of the secret
          ride in each word, so 74 bits fit in roughly twenty.
        </p>
        <p className="text-fg-dim">// limits</p>
        <ul className="space-y-1">
          <li>— a lab experiment, not a secure channel</li>
          <li>— up to 16 characters</li>
          <li>
            — every word must arrive exactly as written; change or delete one
            and everything after it is lost. v1 durable is the edit-tolerant one
          </li>
          <li>
            — about 145 mb of model, once, at each end. it comes from the
            hugging face cdn, not from this site
          </li>
          <li>— the secret and the passphrase never leave your browser</li>
        </ul>
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
      </div>
    </details>
  )
}
