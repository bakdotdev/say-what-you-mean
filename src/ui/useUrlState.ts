/**
 * Version and mode in the URL, so a view can be linked to directly.
 *
 *   ?v=v1|v2            which scheme
 *   ?mode=hide|reveal   which direction
 *   ?enc=compact|durable  v1 embedding: shortest carrier vs edit-tolerant
 *
 * Uses replaceState while switching within a session (so the back button is
 * not filled with tab clicks) but honours whatever the page was loaded with,
 * and responds to back/forward via popstate.
 */
import { useCallback, useEffect, useState } from "react"

export type Version = "v1" | "v2"
export type Mode = "hide" | "reveal"
export type Encoding = "compact" | "durable"

const VERSIONS: Version[] = ["v1", "v2"]
const MODES: Mode[] = ["hide", "reveal"]
const ENCODINGS: Encoding[] = ["compact", "durable"]

const readParams = (): { version: Version; mode: Mode; encoding: Encoding } => {
  if (typeof window === "undefined")
    return { version: "v1", mode: "hide", encoding: "durable" }
  const params = new URLSearchParams(window.location.search)
  const v = params.get("v")
  const m = params.get("mode")
  const e = params.get("enc")
  return {
    version: VERSIONS.includes(v as Version) ? (v as Version) : "v1",
    mode: MODES.includes(m as Mode) ? (m as Mode) : "hide",
    encoding: ENCODINGS.includes(e as Encoding) ? (e as Encoding) : "durable",
  }
}

export function useUrlState() {
  const [{ version, mode, encoding }, setStateInternal] = useState(readParams)

  // Keep in step with back/forward navigation.
  useEffect(() => {
    const onPop = () => setStateInternal(readParams())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const write = useCallback(
    (next: { version: Version; mode: Mode; encoding: Encoding }) => {
    const params = new URLSearchParams(window.location.search)
    params.set("v", next.version)
    params.set("mode", next.mode)
    params.set("enc", next.encoding)
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`,
      )
    },
    [],
  )

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

  const setEncoding = useCallback(
    (next: Encoding) => {
      setStateInternal((prev) => {
        const value = { ...prev, encoding: next }
        write(value)
        return value
      })
    },
    [write],
  )

  // Normalise the URL on first load so a bare visit still shows the params.
  useEffect(() => {
    write({ version, mode, encoding })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { version, mode, encoding, setVersion, setMode, setEncoding }
}
