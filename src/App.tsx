import { useState } from "react"
import { HideView } from "./ui/HideView"
import { RevealView } from "./ui/RevealView"
import { About } from "./ui/About"

type Tab = "hide" | "reveal"

export function App() {
  const [tab, setTab] = useState<Tab>("hide")

  return (
    <main className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Say What You Mean
        </h1>
        <p className="mt-1 text-sm text-muted">
          Hide a short message inside ordinary text you write yourself — no
          hidden characters, just your words read through a shared key.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Mode"
        className="mb-6 inline-flex rounded-lg border border-edge bg-panel p-1"
      >
        {(["hide", "reveal"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={
              "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors " +
              (tab === t
                ? "bg-accent text-white"
                : "text-muted hover:text-fg")
            }
          >
            {t}
          </button>
        ))}
      </div>

      <section aria-live="polite">
        {tab === "hide" ? <HideView /> : <RevealView />}
      </section>

      <footer className="mt-10">
        <About />
      </footer>
    </main>
  )
}
