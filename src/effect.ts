import { Effect } from "effect"
import * as Schedule from "effect/Schedule"
import {
  ConflictExhausted,
  FileSystemError,
  modify as modifyPromise,
  read as readPromise,
  type ModifyOutcome
} from "./core.js"

export { ConflictExhausted, FileSystemError, type ModifyOutcome }

class Conflict extends Error {
  readonly _tag = "Conflict"
}

export interface ModifyOptions {
  readonly retry?: Schedule.Schedule<unknown>
}

export const modify = (
  filePath: string,
  transform: (contents: string) => string,
  options?: ModifyOptions
): Effect.Effect<ModifyOutcome, FileSystemError | ConflictExhausted> => {
  const once = (): Effect.Effect<
    ModifyOutcome,
    FileSystemError | ConflictExhausted | Conflict
  > =>
    Effect.tryPromise({
      try: () => modifyPromise(filePath, transform),
      catch: (e) => e as FileSystemError | ConflictExhausted
    }).pipe(
      Effect.flatMap((outcome) =>
        outcome === "dropped-conflict"
          ? Effect.fail(new Conflict())
          : Effect.succeed(outcome)
      )
    )

  const withRetry = options?.retry
    ? Effect.retry(once(), {
        schedule: options.retry,
        while: (e) => e._tag === "Conflict"
      })
    : once()

  return withRetry.pipe(
    Effect.catchTag("Conflict", () =>
      options?.retry
        ? Effect.fail(new ConflictExhausted(filePath))
        : Effect.succeed("dropped-conflict" as const)
    )
  )
}

export const read = (filePath: string): Effect.Effect<string, FileSystemError> =>
  Effect.tryPromise({
    try: () => readPromise(filePath),
    catch: (e) => e as FileSystemError
  })
