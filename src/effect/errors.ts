/** Public errors for the Effect-native read-modify-write subpath.
 *
 * All errors extend `Error` so they can be thrown by the Promise facade and
 * returned in typed Effect failure channels. Messages may name the path, but
 * never echo file contents or parse details — state files can carry secrets.
 */

/** The file does not exist. Only the read-only `read` can fail this way. */
export class AbsentError extends Error {
  readonly _tag = "AbsentError"
  constructor(readonly path: string) {
    super(`State file does not exist: ${path}`)
  }
}

/** The file could not be read (unreadable, or gone mid-cycle). */
export class ReadError extends Error {
  readonly _tag = "ReadError"
  constructor(readonly path: string) {
    super(`State file could not be read: ${path}`)
  }
}

/** The durable write (tmp create, fsync, rename, or link) could not complete. */
export class WriteError extends Error {
  readonly _tag = "WriteError"
  constructor(readonly path: string) {
    super(`State file could not be written durably: ${path}`)
  }
}

/** The file contents or the transformed value did not match the caller's schema. */
export class ContentsInvalidError extends Error {
  readonly _tag = "ContentsInvalidError"
  constructor(readonly path: string) {
    super(`State file contents do not match the schema: ${path}`)
  }
}

/** The configured path is not usable as a state file path. */
export class PathInvalidError extends Error {
  readonly _tag = "PathInvalidError"
  constructor() {
    super("State file path must be a non-empty absolute path")
  }
}

/** Conflicts on the file outlasted the caller's retry schedule. */
export class ConflictExhausted extends Error {
  readonly _tag = "ConflictExhausted"
  constructor(readonly path: string) {
    super(`Conflicts on state file outlasted the retry schedule: ${path}`)
  }
}
