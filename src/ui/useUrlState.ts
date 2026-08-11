/**
 * Version and mode in the URL, so a view can be linked to directly.
 *
 *   ?v=v1|v2   which scheme
 *   ?mode=hide|reveal
 *
 * Uses replaceState while switching within a session (so the back button is
 * not filled with tab clicks) but honours whatever the page was loaded with,
 * and responds to back/forward via popstate.
 */
import { useCallback, useEffect, useState } from "react"

export type Version = "v1" | "v2"
export type Mode = "hide" | "reveal"

const VERSIONS: Version[] = ["v1", "v2"]
const MODES: Mode[] = ["hide", "reveal"]

const readParams = (): { version: Version; mode: Mode } => {
  if (typeof window === "undefined") return { version: "v1", mode: "hide" }
  const params = new URLSearchParams(window.location.search)
  const v = params.get("v")
  const m = params.get("mode")
  return {
    version: VERSIONS.includes(v as Version) ? (v as Version) : "v1",
    mode: MODES.includes(m as Mode) ? (m as Mode) : "hide",
  }
}

export function useUrlState() {
  const [{ version, mode }, setStateInternal] = useState(readParams)

  // Keep in step with back/forward navigation.
  useEffect(() => {
    const onPop = () => setStateInternal(readParams())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const write = useCallback((next: { version: Version; mode: Mode }) => {
    const params = new URLSearchParams(window.location.search)
    params.set("v", next.version)
    params.set("mode", next.mode)
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    )
  }, [])

  const setVersion = useCallback(
    (next: Version) => {
      setStateInternal((prev) => {
        const value = { ...prev, version: next }
        write(value)
        return value
      })
    },
    [write],
  )

  const setMode = useCallback(
    (next: Mode) => {
      setStateInternal((prev) => {
        const value = { ...prev, mode: next }
        write(value)
        return value
      })
    },
    [write],
  )

  // Normalise the URL on first load so a bare visit still shows the params.
  useEffect(() => {
    write({ version, mode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { version, mode, setVersion, setMode }
}
