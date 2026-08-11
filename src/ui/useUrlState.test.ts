import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useUrlState } from "./useUrlState"

const setUrl = (search: string) =>
  window.history.replaceState(null, "", `/say-what-you-mean/${search}`)

describe("useUrlState", () => {
  beforeEach(() => setUrl(""))

  it("defaults to v1 / hide", () => {
    const { result } = renderHook(() => useUrlState())
    expect(result.current.version).toBe("v1")
    expect(result.current.mode).toBe("hide")
  })

  it("reads version and mode from the url", () => {
    setUrl("?v=v2&mode=reveal")
    const { result } = renderHook(() => useUrlState())
    expect(result.current.version).toBe("v2")
    expect(result.current.mode).toBe("reveal")
  })

  it("ignores invalid values", () => {
    setUrl("?v=v9&mode=explode")
    const { result } = renderHook(() => useUrlState())
    expect(result.current.version).toBe("v1")
    expect(result.current.mode).toBe("hide")
  })

  it("writes changes back to the url", () => {
    const { result } = renderHook(() => useUrlState())
    act(() => result.current.setVersion("v2"))
    expect(window.location.search).toContain("v=v2")
    act(() => result.current.setMode("reveal"))
    expect(window.location.search).toContain("mode=reveal")
    // switching mode must not clobber the version
    expect(window.location.search).toContain("v=v2")
  })

  it("normalises a bare url on load", () => {
    const { result } = renderHook(() => useUrlState())
    expect(result.current.version).toBe("v1")
    expect(window.location.search).toContain("v=v1")
    expect(window.location.search).toContain("mode=hide")
  })
})

describe("useUrlState — encoding", () => {
  it("defaults to durable and round-trips compact", () => {
    window.history.replaceState(null, "", "/say-what-you-mean/")
    const { result } = renderHook(() => useUrlState())
    expect(result.current.encoding).toBe("durable")
    act(() => result.current.setEncoding("compact"))
    expect(window.location.search).toContain("enc=compact")
    // other params survive
    expect(window.location.search).toContain("v=v1")
    expect(window.location.search).toContain("mode=hide")
  })

  it("reads enc from the url and ignores invalid values", () => {
    window.history.replaceState(null, "", "/say-what-you-mean/?enc=compact")
    expect(renderHook(() => useUrlState()).result.current.encoding).toBe("compact")
    window.history.replaceState(null, "", "/say-what-you-mean/?enc=nonsense")
    expect(renderHook(() => useUrlState()).result.current.encoding).toBe("durable")
  })
})
