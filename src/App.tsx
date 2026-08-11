import { useState } from "react"
import { HideView } from "./ui/HideView"
import { RevealView } from "./ui/RevealView"
import { PageEffect } from "./ui/PageEffect"

type Tab = "hide" | "reveal"

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: "hide", label: "hide", glyph: "▚" },
  { id: "reveal", label: "reveal", glyph: "▞" },
]

export function App() {
  const [tab, setTab] = useState<Tab>("hide")

  const tabs = (
    <div
      role="tablist"
      aria-label="Mode"
      className="flex border border-edge lg:flex-col"
    >
      {TABS.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={
            "flex flex-1 items-center justify-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors " +
            (i > 0 ? "border-l border-edge lg:border-l-0 lg:border-t " : "") +
            (tab === t.id
              ? "bg-accent/15 text-fg"
              : "bg-panel text-muted hover:text-fg-dim")
          }
        >
          <span aria-hidden="true">{t.glyph}</span>
          {t.label}
        </button>
      ))}
    </div>
  )

  return (
    <PageEffect>
      <main className="mx-auto max-w-[86rem] px-4 py-8 uppercase sm:py-10">
        <header className="mb-4 border-b border-edge pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-sm uppercase tracking-[0.25em] text-fg">
              say-what-you-mean
            </h1>
            <span className="text-[10px] tracking-wider text-muted">v1</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed tracking-wider text-muted">
            // coverless steganography — your exact words, read through a shared
            key. no hidden characters.
          </p>
        </header>

        <section aria-live="polite">
          {tab === "hide" ? (
            <HideView tabs={tabs} />
          ) : (
            <RevealView tabs={tabs} />
          )}
        </section>
      </main>
    </PageEffect>
  )
}
