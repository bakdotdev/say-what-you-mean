import { describe, it, expect } from "vitest"
// @ts-expect-error plain JS module shared with the edge routes
import { originAllowed } from "../../api/_origin.js"

const reqWith = (origin?: string) =>
  ({ headers: { get: (k: string) => (k === "origin" ? (origin ?? null) : null) } })

describe("api origin allow-list", () => {
  it("allows the hosts the app is served from", () => {
    for (const o of [
      "https://lab.bak.dev",
      "https://bak.dev",
      "https://say-what-you-mean-six.vercel.app",
      "http://localhost:5231",
      "http://127.0.0.1:5173",
    ]) {
      expect(originAllowed(reqWith(o))).toBe(true)
    }
  })

  it("rejects other origins", () => {
    for (const o of [
      "https://evil.example",
      "https://bak.dev.evil.com",
      "https://notbak.dev",
      "garbage",
    ]) {
      expect(originAllowed(reqWith(o))).toBe(false)
    }
  })

  it("allows requests with no Origin header", () => {
    expect(originAllowed(reqWith(undefined))).toBe(true)
  })
})
