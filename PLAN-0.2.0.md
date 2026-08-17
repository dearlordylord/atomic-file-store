# Implementation Plan: 0.2.0 — Effect-native read-modify-write

Tracking issue: [#1](https://github.com/dearlordylord/atomic-file-store/issues/1).
This document is the complete handoff for a coding agent: it stands alone, but
the behavioral source of truth is the origin implementation in
[`dearlordylord/voila-sdk@917421c`](https://github.com/dearlordylord/voila-sdk/tree/917421c61eb9879cc304b05c2e0aed65a0b8de8d/packages/cas-file-store):

- `packages/cas-file-store/src/cas-file-store.ts` (430 LOC) — engine, decisions, outcomes, conflict policy, errors
- `packages/cas-file-store/src/schema.ts` (144 LOC) — Effect Schema wrapper
- `packages/cas-file-store/src/state-file-locks.ts` (138 LOC) — in-process lock service
- `packages/cas-file-store/src/state-file-path.ts` (33 LOC) — branded path
- `packages/cas-file-store/test/{cas-file-store,schema,state-file-locks}.test.ts` (~1140 LOC) — test suites to port

If that link is inaccessible, ask the maintainer before improvising on
semantics — the invariants section below covers the critical ones, but the
tests encode the details.

## Goal

Ship `atomic-file-store@0.2.0` whose `./effect` subpath is a full Effect-native
guarded read-modify-write store: the transform is an `Effect` that may perform
arbitrary I/O (network calls with typed requirements) *inside* the
conflict-checked read → transform → write window. This is the library's
differentiator over `atomically` and the blocker for voila-sdk's migration
(dearlordylord/voila-sdk#4 origin, migration epic to be re-filed after release).

## Non-goals

- **Do not change the Promise core API** (`src/core.ts`, `src/index.ts`). Its
  sync-transform `modify`/`read` signatures, string-union outcome, and
  `{ attempts, delayMs }` retry policy stay as published in 0.1.1.
- Known core limitations to leave alone (note them in release notes; a
  follow-up issue should be filed): the core requires the file to exist
  beforehand, and its re-read-compare-then-`rename` has a small TOCTOU window
  that the ported Effect engine narrows with an exclusive-`link` create and an
  uninterruptible compare-through-write. Aligning the Promise core with the
  stronger mechanism is a 0.3.0 candidate, not this milestone.
- Do not publish to npm. The maintainer publishes. Your job ends at a green
  working tree, a version-bump commit, and a pushed tag (see Release).

## Current state

- `src/core.ts` — Promise engine: module-global promise-chain per path for
  in-process serialization, tmp+fsync+rename writes, byte-compare CAS.
- `src/effect.ts` — 61-line thin wrapper: `modify(filePath, (string) => string, { retry?: Schedule })`,
  `read(filePath)`, re-exporting `FileSystemError` / `ConflictExhausted`.
  Contains `as` casts — they leave with this rewrite.
- `test/effect.test.ts`, `test/index.test.ts` — plain vitest, real filesystem,
  no mocks. `@effect/vitest` is already a devDependency.
- `AGENTS.md` conventions: pnpm, Node >= 20, zero runtime deps in core, public
  errors extend `Error`.

### AGENTS.md amendment (part of this work)

The rule *"Do not duplicate behavior between `src/index.ts` and `src/effect.ts`;
both delegate to `src/core.ts`"* cannot survive this milestone: an Effect
transform with a requirements channel (`Effect<A, E, R>`) cannot be run inside
the Promise core without erasing `R`. Replace it with:

- `src/core.ts` owns the Promise/sync surface.
- `src/effect/` owns the Effect-native engine. It shares mechanism *concepts*
  with the core but not implementation.
- Pure, dependency-free helpers both sides need (tmp path naming, file modes)
  may live in `src/internal/` and be imported by both.

## Target public API (`atomic-file-store/effect`)

Exact surface after 0.2.0. All errors are `class X extends Error` with
`readonly _tag` (repo convention; also keeps `Effect.catchTag` working).

```ts
// --- path ---
export const StateFilePathSchema: Schema.Schema<StateFilePath>  // non-empty absolute path, branded "StateFilePath"
export type StateFilePath                                       // Schema.Schema.Type<typeof StateFilePathSchema>
export const parseStateFilePath: (value: unknown) => Effect.Effect<StateFilePath, PathInvalidError>

// --- write decisions ---
export type WriteDecision<A> = { readonly _tag: "write"; readonly value: A } | { readonly _tag: "keep" }
export const persist: <A>(value: A) => WriteDecision<A>
export const keep: WriteDecision<never>

// --- outcomes ---
export type ModifyOutcome<A> =
  | { readonly _tag: "saved"; readonly value: A }
  | { readonly _tag: "unchanged" }
  | { readonly _tag: "dropped-conflict"; readonly value: A | undefined }

export interface SchemaCycleStep<A, C> { readonly carried: C; readonly decision: WriteDecision<A> }

export type CarriedModifyOutcome<A, C> =
  | { readonly _tag: "saved"; readonly carried: C; readonly value: A }
  | { readonly _tag: "unchanged"; readonly carried: C }
  | { readonly _tag: "dropped-conflict"; readonly carried: C; readonly value: A | undefined }

// --- conflict policy ---
export type ConflictPolicy =
  | { readonly _tag: "drop" }
  | { readonly _tag: "retry"; readonly schedule: Schedule.Schedule<unknown, unknown, never> }
export const dropPolicy: ConflictPolicy
export const retryPolicy: (schedule: Schedule.Schedule<unknown, unknown, never>) => ConflictPolicy

// --- errors (all extend Error; messages may include the path, never contents) ---
export class AbsentError extends Error          { readonly _tag = "AbsentError" }
export class ReadError extends Error            { readonly _tag = "ReadError" }
export class WriteError extends Error           { readonly _tag = "WriteError" }
export class ContentsInvalidError extends Error { readonly _tag = "ContentsInvalidError" }
export class PathInvalidError extends Error     { readonly _tag = "PathInvalidError" }
export class ConflictExhausted extends Error    { readonly _tag = "ConflictExhausted" } // already exists; keep

// --- in-process locks ---
export interface StateFileLocksService {
  readonly withPermit: <A, E, R>(key: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}
export class StateFileLocks extends Context.Tag("atomic-file-store/StateFileLocks")<StateFileLocks, StateFileLocksService>
export const makeStateFileLocks: (capacity?: number) => Effect.Effect<StateFileLocksService>
export const stateFileLocksLayer: (capacity?: number) => Layer.Layer<StateFileLocks>
export const StateFileLocksLive: Layer.Layer<StateFileLocks>

// --- the cycle ---
export const read: (path: StateFilePath) => Effect.Effect<string, AbsentError | ReadError>

export const modify: <E = never, R = never>(
  path: StateFilePath,
  f: (contents: string | undefined) => Effect.Effect<WriteDecision<string>, E, R>,
  policy?: ConflictPolicy // default dropPolicy
) => Effect.Effect<ModifyOutcome<string>, ReadError | WriteError | ConflictExhausted | E, R | StateFileLocks>

export const modifySchema: <A, I, RSchema, E = never, R = never>(
  path: StateFilePath,
  schema: Schema.Schema<A, I, RSchema>,
  f: (value: A | undefined) => Effect.Effect<WriteDecision<A>, E, R>,
  policy?: ConflictPolicy
) => Effect.Effect<ModifyOutcome<A>, ReadError | WriteError | ContentsInvalidError | ConflictExhausted | E, R | RSchema | StateFileLocks>

export const modifySchemaCarrying: <A, I, RSchema, C, E = never, R = never>(
  path: StateFilePath,
  schema: Schema.Schema<A, I, RSchema>,
  f: (value: A | undefined) => Effect.Effect<SchemaCycleStep<A, C>, E, R>,
  policy?: ConflictPolicy
) => Effect.Effect<CarriedModifyOutcome<A, C>, ReadError | WriteError | ContentsInvalidError | ConflictExhausted | E, R | RSchema | StateFileLocks>
```

### Breaking changes from 0.1.x `./effect` (list these in release notes)

- `modify` signature changes: sync `(string) => string` transform →
  Effect-returning transform over `string | undefined`; `ModifyOptions`/`RetryPolicy`
  removed in favor of `ConflictPolicy`.
- `ModifyOutcome` changes from `"saved" | "dropped-conflict"` string union to
  the tagged object union above.
- `FileSystemError` is no longer returned by the `./effect` functions; the
  granular classes above replace it. It remains the error type of the Promise
  core (`.`).
- Both `modify` and `read` now take `StateFilePath`, not `string`.

## File-by-file directions

New module layout (splitting `src/effect.ts` — it would otherwise blow past any
reasonable file-size bound):

- **`src/effect/path.ts`** — port `state-file-path.ts` verbatim except:
  `CasFileStorePathInvalid` → `PathInvalidError` class. Keep: `Schema.String`
  + `filter(non-empty && isAbsolute)` + `brand("StateFilePath")`; the error
  message does **not** include the offending path.
- **`src/effect/locks.ts`** — port `state-file-locks.ts` verbatim except the
  tag string → `atomic-file-store/StateFileLocks`. Keep every behavior: bounded
  table (default 256), LRU eviction of *idle* entries only (`active === 0`),
  monotone `released` counter instead of a clock, uninterruptible
  checkout/checkin around `semaphore.withPermits(1)`, no background fibers or
  timers. `makeStateFileLocks` stays a pure `Ref` allocation so composition
  roots can build one instance up front.
- **`src/effect/errors.ts`** — the error classes above.
- **`src/effect/engine.ts`** — port `cas-file-store.ts`:
  - internals (not exported from the barrel): `WritePayload`, `CycleStep`,
    `CarryOutcome`, `ConflictSignal`, `readModifyWrite`, `modifyCarrying`,
    `writeThroughTemporary`, `createRawExclusive`, `replaceRawAtomic`,
    `replaceIfUnchanged`, `createIfAbsent`, `readOptionalRaw`;
  - public: `read`, `modify`, plus the decision/outcome/policy types and
    constructors.
- **`src/effect/schema.ts`** — port `schema.ts` (`modifySchema`,
  `modifySchemaCarrying`) against the new names.
- **`src/effect.ts`** — becomes a pure barrel re-exporting the four modules;
  the `./effect` subpath entry in `package.json` does not move.
- **`src/index.ts`, `src/core.ts`** — untouched.

## Mechanism invariants (encode these; the ported tests check them)

1. **Absence is a value, not an error.** The cycle reads with
   `readOptionalRaw` (ENOENT → `undefined`) and hands `undefined` to the
   transform; creation happens inside the same guarded cycle. Only the
   read-only `read` fails on absence (`AbsentError`).
2. **CAS token = raw bytes as read.** Comparison never goes through a
   decoded/re-encoded value, so non-canonical JSON serialization cannot cause
   phantom conflicts. The Schema wrapper decodes for the transform and encodes
   for the write, but the engine compares bytes.
3. **Exclusive create via `link`.** When the file was absent, the write lands
   with `link(tmp, path)`, which refuses to clobber (EEXIST ⇒ lost race ⇒
   conflict). No re-read before it — that would only widen the window.
4. **Existing file: re-read, compare, tmp+rename.** Write tmp sibling
   (0o600), fsync, rename onto target. Directory created `recursive, 0o700` —
   a first run has no config directory, and state files carry secrets.
5. **The compare-through-write is `Effect.uninterruptible`.** The underlying
   write promise cannot be aborted; an interruptible fiber would exit while
   its rename is still in flight and release the lock permit, letting the
   zombie rename land on a later writer.
6. **`ConflictSignal` is a `Data.TaggedClass`, deliberately not an `Error`
   subclass** — it carries the file's raw bytes (potential secrets) and Effect
   pretty-prints the fields of failed `Error`s in causes.
7. **Lock permit per attempt, not per policy.** A retry schedule's delay must
   not hold the in-process permit. Lock key is `resolve(path)` so different
   spellings of one file share a lock.
8. **Best-effort tmp cleanup** via `Effect.ensuring(Effect.ignore(...))` — a
   cleanup failure must never mask a write failure.
9. **Carried values ride every outcome.** `saved`/`dropped-conflict` carry the
   transform's write payload; `unchanged` carries the keep payload. The Schema
   wrapper's `dropped-conflict` decodes the winner's bytes for the caller to
   adopt (`undefined` when the winner removed the file). Never re-decode the
   bytes just written to build a `saved` outcome — a non-round-tripping schema
   would fail *after* the write landed.
10. **Secret-free errors.** Messages may name the path but never echo file
    contents or parse details.
11. **No plain `write` primitive** in the public surface. The only way bytes
    reach the target is the guarded cycle.
12. **No `as` casts anywhere in `src/`.**

## Test plan

Port the three suites from voila-sdk into this repo's style (real filesystem,
temp dirs via `fs.mkdtemp`, no mocks). Suggested mapping:

- `test/effect-engine.test.ts` ← `cas-file-store.test.ts` (638 LOC): creation,
  keep/persist, conflict drop, retry policy + `ConflictExhausted`, carried
  outcomes, raw-bytes CAS, permission/durability failures, interruption
  safety, in-process serialization.
- `test/effect-schema.test.ts` ← `schema.test.ts` (333 LOC): decode/encode,
  contents-invalid on disk and on write, carried plumbing, dropped-conflict
  adoption decoding.
- `test/effect-locks.test.ts` ← `state-file-locks.test.ts` (169 LOC): mutual
  exclusion, eviction bound, no leaks, interruption keeps counts exact.
- Keep the two existing `test/{index,effect}.test.ts` smoke tests; rewrite the
  effect one against the new API.

Harness notes: `@effect/vitest` is available — use `it.effect` for Effect
suites and provide `StateFileLocksLive` per test (mirror voila's `itLocks`
helper). Where voila's tests used `@effect/vitest`'s `TestServices`, plain
`it.effect` suffices here — there are no TestClock-dependent cases worth
porting; if one appears, keep the clock injected, never real-time-sensitive
assertions.

Every public export must be exercised at least once. All existing Promise-core
tests must pass unchanged.

## Docs

- **README.md** — add an "Effect API" section: install note (`effect` is an
  optional peer — only needed for this subpath), a `modifySchema` example with
  a domain type, a short paragraph on why the guarded Effect transform matters
  (I/O inside the conflict-checked window; this is the differentiator vs
  `atomically`), the conflict-policy semantics (drop vs retry, no merge), and
  the secret-free error guarantee. Update the 0.1.x effect snippet to the new
  API.
- **AGENTS.md** — apply the convention amendment described above (package
  layout section: `src/effect/` modules, `src/internal/` allowance).
- **RESEARCH.md** — no changes.

## Release

1. `pnpm install && pnpm build && pnpm typecheck && pnpm test` — all green.
2. Bump `package.json` version to `0.2.0`.
3. `pnpm publish --dry-run` — verify tarball contains the new `dist/` files and
   README.
4. Commit (`0.2.0` bump as its own commit), tag `v0.2.0`, push branch + tag.
5. **Do not run `pnpm publish`.** Report ready-to-publish to the maintainer.

## Acceptance checklist

- [ ] Target API above exported from `atomic-file-store/effect`, signatures exact
- [ ] All 12 mechanism invariants hold; ported suites + existing suites green
- [ ] No `as` casts in `src/`; no test mocks
- [ ] `src/core.ts` / `src/index.ts` byte-identical to 0.1.1
- [ ] README Effect section added; AGENTS.md amended
- [ ] Version `0.2.0`, tag `v0.2.0` pushed, dry-run pack verified
- [ ] Breaking changes enumerated in the release notes draft for the maintainer
