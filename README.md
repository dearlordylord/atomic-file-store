# atomic-file-store

> Atomic read-modify-write for local JSON files. Compare-and-swap optimistic
> concurrency across processes — no lockfiles, no merges.

Your CLI writes a session file. Your MCP server refreshes it. Your keepalive
daemon touches it too. Plain `read` + `write` loses updates. [`conf`](https://www.npmjs.com/package/conf),
[`lowdb`](https://www.npmjs.com/package/lowdb) and [`electron-store`](https://www.npmjs.com/package/electron-store)
explicitly don't support multiple processes writing the same file;
[`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile) serializes with lockfiles.
This package takes the database approach instead: **optimistic concurrency**.

> **Status:** initial implementation. The core RMW engine is in place; the
> Effect facade is complete. See [`RESEARCH.md`](./RESEARCH.md) for the
> ecosystem analysis and discoverability plan, and
> [`dearlordylord/voila-sdk#4`](https://github.com/dearlordylord/voila-sdk/issues/4)
> for the original design rationale.

## When to use / when not

Use this for small local state files shared by a few local processes — a CLI,
an MCP server, and a background keepalive, all writing the same credentials or
session JSON.

Do **not** use it for cross-machine state, large files, or scenarios where you
want merge semantics. Conflicts are reported, not resolved.

## Plain TypeScript / Promise API

The default entry point is zero-dependency (Node built-ins only):

```ts
import { modify, read } from "atomic-file-store"

const outcome = await modify(
  "~/.my-cli/session.json",
  (contents) => updateToken(contents)
)

// outcome: "saved" | "dropped-conflict"
```

`modify` owns the whole cycle:

1. Fresh read of the file bytes.
2. Run your transform on the contents.
3. Compare the file bytes against the CAS token captured at read time.
4. Write to a temp file, `fsync`, then `rename` — but only if the file is unchanged.
5. On conflict, either drop the update (`"dropped-conflict"`) or re-read and retry
   with the supplied policy.

Retry for unique-intent writes:

```ts
import { modify, ConflictExhausted } from "atomic-file-store"

try {
  await modify("session.json", transform, {
    retry: { attempts: 3, delayMs: 10 }
  })
} catch (e) {
  if (e instanceof ConflictExhausted) {
    // pathologically contended file
  }
}
```

## Effect API (`atomic-file-store/effect`)

If you use [Effect](https://effect.website/), import the same engine through
its Effect facade:

```ts
import { Effect, Schedule } from "effect"
import { modify } from "atomic-file-store/effect"

const program = modify(
  "~/.my-cli/session.json",
  (contents) => updateToken(contents),
  { retry: Schedule.recurs(3).pipe(Schedule.addDelay(() => "10 millis")) }
)

const outcome = await Effect.runPromise(program)
// outcome: "saved" | "dropped-conflict"
// failure channel: FileSystemError | ConflictExhausted
```

### Caveat: the Effect subpath brings the `effect` dependency

`atomic-file-store/effect` is a thin wrapper over the same zero-dependency core,
but it imports `effect` so that it can expose typed `Effect.Effect<…>` return
values and accept `Schedule` for retry. If you don't already depend on Effect,
your package manager will install it (and its small set of runtime deps) when
you import this subpath.

### What you get for that dependency

- **Typed errors in the type signature.** `FileSystemError` and
  `ConflictExhausted` live in `Effect.Effect<…, …>` instead of being thrown
  through a `Promise` catch block.
- **Composable retry schedules.** Pass any `Schedule` — exponential back-off,
  jitter, recurs + delay, etc. — instead of the fixed `attempts`/`delayMs`
  object the Promise API accepts.
- **Deterministic, fast tests.** Drive multi-process interleavings and retry
  delays with Effect `TestClock`; seconds of real time collapse to milliseconds.
- **Interruption safety.** Effect's cancellation and `acquireUseRelease`
  machinery can clean up temp files or locks if a fiber is cancelled mid-write.
  (The Promise API has no cancellation model.)
- **Same implementation.** Both APIs run through the identical byte-level CAS
  check, temp-file + fsync + rename write path, and per-path in-process
  serialization. The facade is ~40 lines; the behavior is not duplicated.

## Installation

```bash
pnpm add atomic-file-store
```

Effect users also need `effect` installed (peer dependency, marked optional so
plain-TS consumers don't pay for it):

```bash
pnpm add effect
```

## Compared to

| Package | What it gives you | Why it's not this |
|---|---|---|
| [`atomically`](https://www.npmjs.com/package/atomically) / [`write-file-atomic`](https://www.npmjs.com/package/write-file-atomic) | Durable atomic writes (tmp + rename + fsync) | Write-only primitives; no read-modify-write, no CAS, no conflict detection |
| [`conf`](https://www.npmjs.com/package/conf) / [`electron-store`](https://www.npmjs.com/package/electron-store) | Small JSON config store | README: "It does not support multiple processes writing to the same store" |
| [`lowdb`](https://www.npmjs.com/package/lowdb) / [`steno`](https://www.npmjs.com/package/steno) | Queued atomic JSON writer | No cross-process CAS; no conflict outcome |
| [`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile) | Cross-process serialization | Lockfile stale-lock failure modes; this package uses optimistic concurrency instead |

## License

MIT © firfi
