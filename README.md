# atomic-file-store

> Atomic read-modify-write for local JSON files. Compare-and-swap optimistic
> concurrency across processes — no lockfiles, no merges.

Your CLI writes a session file. Your MCP server refreshes it. Your keepalive
daemon touches it too. Plain `read` + `write` loses updates. [`conf`](https://www.npmjs.com/package/conf),
[`lowdb`](https://www.npmjs.com/package/lowdb) and [`electron-store`](https://www.npmjs.com/package/electron-store)
explicitly don't support multiple processes writing the same file;
[`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile) serializes with lockfiles.
This package takes the database approach instead: **optimistic concurrency**.

> **Status:** scaffold. The implementation is being migrated from
> [`dearlordylord/voila-sdk#4`](https://github.com/dearlordylord/voila-sdk/issues/4).
> See [`RESEARCH.md`](./RESEARCH.md) for the ecosystem analysis and discoverability plan.

## When to use / when not

Use this for small local state files shared by a few local processes — a CLI,
an MCP server, and a background keepalive, all writing the same credentials or
session JSON.

Do **not** use it for cross-machine state, large files, or scenarios where you
want merge semantics. Conflicts are reported, not resolved.

## Planned API

```ts
import { Effect } from "effect"
import { FileStore, ConflictExhausted } from "atomic-file-store"

const outcome = yield* FileStore.modify(
  "~/.my-cli/session.json",
  (contents) => updateToken(contents),
  { retry: Schedule.recurs(3) }
)

// outcome: "saved" | "dropped-conflict"
// retry exhaustion: Effect fails with ConflictExhausted
```

`modify` owns the whole cycle:

1. Fresh read of the file bytes.
2. Run your transform on the contents.
3. Compare the file bytes against the CAS token captured at read time.
4. Write to a temp file, `fsync`, then `rename` — but only if the file is unchanged.
5. On conflict, either drop the update (`"dropped-conflict"`) or re-read and retry
   with the supplied Effect `Schedule`.

## Installation

```bash
pnpm add atomic-file-store
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
