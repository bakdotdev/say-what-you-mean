/**
 * Recover payload bits from a bag of GF(2) equations.
 *
 * Strategy: peeling first (fast, and all that's usually needed), then a
 * Gaussian-elimination finish for any bits still coupled. Bits that no
 * surviving equation constrains come back as null (erasures).
 */
import type { Bit } from "./bytes"
import type { Equation } from "./equations"

export interface SolveResult {
  bits: (Bit | null)[]
  /** How many bits were determined. */
  determined: number
}

/** Peel: repeatedly resolve any equation that has exactly one unknown. */
const peel = (
  rows: { subset: Set<number>; parity: number }[],
  known: (Bit | null)[],
): void => {
  let progress = true
  while (progress) {
    progress = false
    for (const row of rows) {
      if (row.subset.size === 0) continue
      // reduce by already-known bits
      for (const idx of [...row.subset]) {
        if (known[idx] !== null) {
          row.parity ^= known[idx] as number
          row.subset.delete(idx)
        }
      }
      if (row.subset.size === 1) {
        const idx = row.subset.values().next().value as number
        known[idx] = (row.parity & 1) as Bit
        row.subset.clear()
        progress = true
      }
    }
  }
}

/** Gaussian elimination over GF(2) on whatever rows peeling left behind. */
const gaussian = (
  rows: { subset: Set<number>; parity: number }[],
  known: (Bit | null)[],
): void => {
  // Build dense-ish rows of remaining unknowns.
  const live = rows
    .map((r) => ({ vars: new Set(r.subset), parity: r.parity }))
    .filter((r) => r.vars.size > 0)
  const pivots = new Map<number, { vars: Set<number>; parity: number }>()

  for (const row of live) {
    const cur = { vars: new Set(row.vars), parity: row.parity }
    while (cur.vars.size > 0) {
      const pivotCol = Math.min(...cur.vars)
      const existing = pivots.get(pivotCol)
      if (!existing) {
        pivots.set(pivotCol, cur)
        break
      }
      // eliminate pivotCol using existing pivot row
      for (const v of existing.vars) {
        if (cur.vars.has(v)) cur.vars.delete(v)
        else cur.vars.add(v)
      }
      cur.parity ^= existing.parity
    }
  }

  // Back-substitute pivots that became singletons.
  let progress = true
  while (progress) {
    progress = false
    for (const [col, row] of pivots) {
      for (const v of [...row.vars]) {
        if (v !== col && known[v] !== null) {
          row.parity ^= known[v] as number
          row.vars.delete(v)
        }
      }
      if (row.vars.size === 1 && known[col] === null) {
        known[col] = (row.parity & 1) as Bit
        progress = true
      }
    }
  }
}

export const solve = (equations: Equation[], B: number): SolveResult => {
  const known: (Bit | null)[] = new Array(B).fill(null)
  const rows = equations.map((e) => ({
    subset: new Set(e.subset),
    parity: e.parity as number,
  }))
  peel(rows, known)
  if (known.some((b) => b === null)) {
    gaussian(rows, known)
    // a final peel pass can finish bits the gaussian back-sub exposed
    peel(rows, known)
  }
  return {
    bits: known,
    determined: known.reduce<number>((n, b) => n + (b !== null ? 1 : 0), 0),
  }
}
