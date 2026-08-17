/**
 * atomic-file-store
 *
 * Public API placeholder — implementation is being migrated from the
 * `voila-sdk` monorepo (https://github.com/dearlordylord/voila-sdk/issues/4).
 *
 * The package will expose a single Effect-native `modify(path, transform, policy?)`
 * call that owns the full read-modify-write cycle of a small local file:
 * fresh read → caller transform → byte-level compare-and-swap check →
 * atomic temp-file + fsync + rename write. Conflicts are reported as
 * `"dropped-conflict"`; retry exhaustion surfaces as a typed `ConflictExhausted`.
 */

export const name = "atomic-file-store"
export const version = "0.1.0"
