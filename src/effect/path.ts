/**
 * The store's one boundary type: which file a cycle acts on.
 *
 * A bare `string` lets any string reach a call that writes state, and lets a
 * relative path mean different files in two processes with different working
 * directories — the exact ambiguity a store shared by several local processes
 * cannot afford. Callers parse once, at the edge where the path is configured.
 */
import { Effect, Schema } from "effect"
import { isAbsolute } from "node:path"

import { PathInvalidError } from "./errors.js"

const isStateFilePath = (value: string): boolean => value.trim().length > 0 && isAbsolute(value)

export const StateFilePathSchema = Schema.String.pipe(
  Schema.filter(isStateFilePath, { message: () => "must be a non-empty absolute path" }),
  Schema.brand("StateFilePath")
)

export type StateFilePath = Schema.Schema.Type<typeof StateFilePathSchema>

/** Turn a configured path into a `StateFilePath`, or fail with a typed error. */
export const parseStateFilePath = (value: unknown): Effect.Effect<StateFilePath, PathInvalidError> =>
  Schema.decodeUnknown(StateFilePathSchema)(value).pipe(Effect.mapError(() => new PathInvalidError()))
