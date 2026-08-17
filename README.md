# atomic-file-store

[![npm version](https://img.shields.io/npm/v/atomic-file-store)](https://www.npmjs.com/package/atomic-file-store)
[![license](https://img.shields.io/npm/l/atomic-file-store)](./LICENSE)

> Atomic read-modify-write for local JSON files. Compare-and-swap optimistic
> concurrency across processes — no lockfiles, no merges.

Your CLI writes a session file. Your MCP server refreshes it. Your keepalive
daemon touches it too. With plain `read` + `write`, the last writer silently
wins and everyone else's updates disappear.

`atomic-file-store` fixes that with the same pattern databases use:
**optimistic concurrency**. Read the file, transform it, and write it back only
if it hasn't changed since you read it. Conflicts are reported, not merged.

## Features

- **Closure-owned RMW** — one `modify(path, transform)` call owns the entire
  read → transform → compare-and-swap → write cycle.
- **Byte-level CAS** — compares raw file bytes, so non-canonical JSON
  serialization can't create phantom conflicts.
- **Atomic durable writes** — temp file + `fsync` + rename; crashes never leave
  a torn file.
- **Per-path in-process serialization** — same-process fibers can't race each
  other by construction.
- **Drop or retry** — default policy drops the in-flight update on conflict;
  opt-in bounded retry for writes that carry unique intent.
- **Effect-native subpath** — `atomic-file-store/effect` gives typed errors,
  `Schedule` retries, `TestClock` tests, and interruption safety.
- **Zero runtime dependencies** for the Promise API (Node built-ins only).

## Quick start

```ts
import { modify } from "atomic-file-store"

const outcome = await modify(
  "~/.my-cli/session.json",
  (contents) => updateToken(contents)
)

// outcome: "saved" | "dropped-conflict"
```

Retry until convergence:

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

## Effect API

If you use [Effect](https://effect.website/):

```ts
import { Effect, Schedule } from "effect"
import { modify } from "atomic-file-store/effect"

const program = modify(
  "session.json",
  transform,
  { retry: Schedule.recurs(3).pipe(Schedule.addDelay(() => "10 millis")) }
)

const outcome = await Effect.runPromise(program)
// failure channel: FileSystemError | ConflictExhausted
```

> **Note:** `atomic-file-store/effect` is a thin wrapper over the same
> zero-dependency core, but it imports `effect`. If you don't already depend on
> Effect, your package manager will install it for this subpath.
>
> You get typed errors, composable `Schedule` retries, fast `TestClock` tests,
> and interruption-aware cleanup — all without duplicating the implementation.

## When to use / when not

Use this for small local state files shared by a few local processes: a CLI,
an MCP server, a background keepalive, or multiple instances of the same app
all writing the same credentials or session JSON.

Do **not** use it for cross-machine state, large files, or merge semantics.
Conflicts are reported, not resolved.

## Installation

```bash
pnpm add atomic-file-store
```

Effect users also need `effect` installed (optional peer dependency):

```bash
pnpm add effect
```

## Compared to

| Package | What it gives you | Why it's not this |
|---|---|---|
| [`atomically`](https://www.npmjs.com/package/atomically) / [`write-file-atomic`](https://www.npmjs.com/package/write-file-atomic) | Durable atomic writes | Write-only primitives; no RMW, no CAS, no conflict detection |
| [`conf`](https://www.npmjs.com/package/conf) / [`electron-store`](https://www.npmjs.com/package/electron-store) | Small JSON config store | Explicitly does not support multiple processes writing the same file |
| [`lowdb`](https://www.npmjs.com/package/lowdb) / [`steno`](https://www.npmjs.com/package/steno) | Queued atomic JSON writer | No cross-process CAS; no conflict outcome |
| [`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile) | Cross-process serialization | Lockfile stale-lock failure modes; this uses optimistic concurrency |

## Background

See [`RESEARCH.md`](./RESEARCH.md) for the ecosystem analysis and
 discoverability plan, and
 [`dearlordylord/voila-sdk#4`](https://github.com/dearlordylord/voila-sdk/issues/4)
 for the original design rationale.

## License

MIT © firfi
