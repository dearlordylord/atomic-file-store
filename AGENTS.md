# Project Instructions

## Package Manager

Use `pnpm`, not npm. Node >=20.

## Build & Test

```bash
pnpm install
pnpm build      # emits dist/
pnpm typecheck  # no emit
pnpm test       # vitest
```

## Publish

Prerequisites:

- You are authenticated with the npm registry (`pnpm config set //registry.npmjs.org/:_authToken <token>` or `npm login`).
- `git status` is clean and `master` is up to date.

Sanity-check the tarball:

```bash
pnpm publish --dry-run
```

Publish:

```bash
pnpm publish
```

`prepack` runs `pnpm build` automatically, so the published tarball always
contains fresh `dist/` output.

## Package Layout

- `src/core.ts` — Promise-based engine: CAS read-modify-write, atomic temp-file
  write, per-path in-process serialization. Zero runtime dependencies.
- `src/index.ts` — Promise-based public API (`modify`, `read`).
- `src/effect/` — Effect-native engine and public subpath
  (`atomic-file-store/effect`). Imports `effect`; importing this subpath
  requires the optional `effect` peer dependency to be installed.
  - `src/effect/engine.ts` — byte-level RMW engine, decisions, outcomes,
    conflict policy.
  - `src/effect/schema.ts` — Schema-aware `modifySchema` / `modifySchemaCarrying`.
  - `src/effect/locks.ts` — `StateFileLocks` service for in-process exclusion.
  - `src/effect/path.ts` — branded `StateFilePath` boundary type.
  - `src/effect/errors.ts` — public error classes.
- `src/effect.ts` — barrel re-exporting `src/effect/`.
- `test/` — real-filesystem tests; no mocks.

## Conventions

- Keep `src/core.ts` and `src/index.ts` free of runtime dependencies (Node
  built-ins only).
- `src/effect/` owns the Effect-native engine. It shares mechanism *concepts*
  with the core but not implementation, because an Effect transform with a
  requirements channel (`Effect<A, E, R>`) cannot be run inside the Promise
  core without erasing `R`.
- Pure, dependency-free helpers both sides need may live in `src/internal/` and
  be imported by both.
- Public error classes extend `Error` so the Promise API can throw them and the
  Effect API can return them in the failure channel.
- No `as` casts anywhere in `src/`.
