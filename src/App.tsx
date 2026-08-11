import { useUrlState } from "./ui/useUrlState"
import { HideView } from "./ui/HideView"
import { RevealView } from "./ui/RevealView"
import { BindHideView } from "./ui/BindHideView"
import { BindRevealView } from "./ui/BindRevealView"
import { PageEffect } from "./ui/PageEffect"


const TABS: { id: "hide" | "reveal"; label: string; glyph: string }[] = [
  { id: "hide", label: "hide message", glyph: "▚" },
  { id: "reveal", label: "reveal message", glyph: "▞" },
]

const VERSIONS: { id: "v1" | "v2"; label: string; blurb: string }[] = [
  {
    id: "v1",
    label: "v1",
    blurb: "the message is hidden in the words · a passphrase unlocks it",
  },
  {
    id: "v2",
    label: "v2",
    blurb: "the words are never touched · they unlock a one-read key",
  },
]

export function App() {
  const {
    version,
    mode: tab,
    encoding,
    setVersion,
    setMode: setTab,
    setEncoding,
  } = useUrlState()

  const tabs = (
    <div
      role="tablist"
      aria-label="Mode"
      className="flex w-full border border-edge"
    >
      {TABS.map((t, i) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={
            "flex flex-1 items-center justify-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors " +
            (i > 0 ? "border-l border-edge " : "") +
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-sm uppercase tracking-[0.25em] text-fg">
              say-what-you-mean
            </h1>
            <div
              role="tablist"
              aria-label="Version"
              className="flex border border-edge"
            >
              {VERSIONS.map((v, i) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={version === v.id}
                  title={v.blurb}
                  onClick={() => setVersion(v.id)}
                  className={
                    "px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition-colors " +
                    (i > 0 ? "border-l border-edge " : "") +
                    (version === v.id
                      ? "bg-accent/15 text-fg"
                      : "bg-panel text-muted hover:text-fg-dim")
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed tracking-wider text-muted">
            {VERSIONS.find((v) => v.id === version)!.blurb} — see readme
          </p>
        </header>

        <div className="mb-3">{tabs}</div>

        <section aria-live="polite">
          {version === "v1" ? (
            tab === "hide" ? (
              <HideView
                durable={encoding === "durable"}
                onDurableChange={(d) => setEncoding(d ? "durable" : "compact")}
              />
            ) : (
              <RevealView />
            )
          ) : tab === "hide" ? (
            <BindHideView />
          ) : (
            <BindRevealView />
          )}
        </section>
      </main>
    </PageEffect>
  )
}
