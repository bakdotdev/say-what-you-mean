/**
 * Minimal GF(2) vector algebra over BigInt bitsets, plus the two solvers
 * matrix embedding needs:
 *
 *   solveSyndrome  — find WHICH cover positions to flip so the syndrome equals
 *                    the message (Gaussian elimination over the usable columns)
 *   sparsify       — shrink that solution toward the coset leader by adding
 *                    null-space vectors, i.e. make the author change as few
 *                    words as possible
 *
 * Positions excluded from `usable` are "wet" in wet-paper-code terms: the
 * author has locked them, and the solver simply never selects them. The
 * receiver needs no knowledge of which were locked.
 */

export type Vec = bigint

export const weight = (v: Vec): number => {
  let n = 0
  let x = v
  while (x) {
    x &= x - 1n
    n++
  }
  return n
}

/** Index of the lowest set bit, or -1 for zero. */
export const lowestBit = (v: Vec): number => {
  if (v === 0n) return -1
  let i = 0
  let x = v
  while (!(x & 1n)) {
    x >>= 1n
    i++
  }
  return i
}

export interface SyndromeSolution {
  /** Cover positions to flip. */
  flips: Set<number>
  /** Null-space combinations, used to sparsify. */
  nullspace: Set<number>[]
}

const symmetricDifference = (into: Set<number>, from: Iterable<number>) => {
  for (const x of from) {
    if (into.has(x)) into.delete(x)
    else into.add(x)
  }
}

/**
 * Solve `XOR of columns[i] for i in flips === target`, choosing only from
 * `usable` positions. Returns null when the target is unreachable (the usable
 * columns don't span it — i.e. too few editable words).
 */
export const solveSyndrome = (
  columns: readonly Vec[],
  usable: readonly number[],
  target: Vec,
): SyndromeSolution | null => {
  // Row-reduce the usable columns, tracking which originals formed each pivot.
  const pivots = new Map<number, { v: Vec; combo: Set<number> }>()
  const nullspace: Set<number>[] = []

  for (const idx of usable) {
    let v = columns[idx]
    const combo = new Set<number>([idx])
    while (v !== 0n) {
      const lb = lowestBit(v)
      const existing = pivots.get(lb)
      if (!existing) {
        pivots.set(lb, { v, combo })
        break
      }
      v ^= existing.v
      symmetricDifference(combo, existing.combo)
    }
    // Reduced to zero => this combination is in the null space.
    if (v === 0n && combo.size > 0) nullspace.push(combo)
  }

  // Reduce the target through the same pivots.
  let cur = target
  const flips = new Set<number>()
  let guard = 0
  while (cur !== 0n) {
    if (guard++ > columns.length + 64) return null
    const lb = lowestBit(cur)
    const existing = pivots.get(lb)
    if (!existing) return null // unreachable with the usable columns
    cur ^= existing.v
    symmetricDifference(flips, existing.combo)
  }

  return { flips, nullspace }
}

/**
 * Greedily add null-space vectors that reduce the number of flips. This is the
 * step that turns "a valid solution" (~half the payload size) into something
 * close to the minimum-weight coset leader.
 */
export const sparsify = (
  flips: Set<number>,
  nullspace: readonly Set<number>[],
  rounds = 8,
): Set<number> => {
  const current = new Set(flips)
  for (let r = 0; r < rounds; r++) {
    let improved = false
    for (const nv of nullspace) {
      let delta = 0
      for (const i of nv) delta += current.has(i) ? -1 : 1
      if (delta < 0) {
        symmetricDifference(current, nv)
        improved = true
      }
    }
    if (!improved) break
  }
  return current
}
