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

- `src/core.ts` — shared engine: CAS read-modify-write, atomic temp-file write,
  per-path in-process serialization. Zero runtime dependencies.
- `src/index.ts` — Promise-based public API (`modify`, `read`).
- `src/effect.ts` — Effect subpath (`atomic-file-store/effect`). Thin wrapper
  over the core; importing this subpath requires the optional `effect` peer
  dependency to be installed.
- `test/` — real-filesystem tests; no mocks.

## Conventions

- Keep the core free of runtime dependencies (Node built-ins only).
- Do not duplicate behavior between `src/index.ts` and `src/effect.ts`; both
  delegate to `src/core.ts`.
- Public error classes extend `Error` so the Promise API can throw them and the
  Effect API can return them in the failure channel.
