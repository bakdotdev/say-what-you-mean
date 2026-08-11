import { describe, it, expect } from "vitest"
import { tokenize } from "./tokenize"

describe("tokenize", () => {
  it("splits on punctuation and whitespace, lower-cases", () => {
    expect(tokenize("The cow, ate!  Grass.")).toEqual([
      "the",
      "cow",
      "ate",
      "grass",
    ])
  })

  it("keeps intra-word apostrophes and folds smart quotes", () => {
    expect(tokenize("it's")).toEqual(["it's"])
    expect(tokenize("it’s")).toEqual(["it's"]) // right single quote
    expect(tokenize("it‘s")).toEqual(["it's"]) // left single quote
  })

  it("is invariant to case, whitespace, and punctuation changes", () => {
    const a = tokenize("Meet at the dock at 8.")
    const b = tokenize("meet   at,, THE dock — at 8")
    expect(a).toEqual(b)
  })

  it("folds unicode compatibility forms via NFKC", () => {
    // fullwidth 'ＡＢ' → 'ab'
    expect(tokenize("ＡＢ")).toEqual(["ab"])
  })

  it("returns empty for punctuation-only or empty input", () => {
    expect(tokenize("  —,. ")).toEqual([])
    expect(tokenize("")).toEqual([])
    expect(tokenize("''")).toEqual([]) // apostrophes only, no letters
  })

  it("keeps digits", () => {
    expect(tokenize("room 101b")).toEqual(["room", "101b"])
  })
})
