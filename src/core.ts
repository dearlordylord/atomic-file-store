import * as fs from "node:fs/promises"
import * as path from "node:path"

export type ModifyOutcome = "saved" | "dropped-conflict"

export class FileSystemError extends Error {
  readonly _tag = "FileSystemError"
  constructor(
    override readonly message: string,
    override readonly cause?: unknown
  ) {
    super(message)
  }
}

export class ConflictExhausted extends Error {
  readonly _tag = "ConflictExhausted"
  constructor(readonly path: string) {
    super(`conflict-exhausted: ${path}`)
  }
}

export interface RetryPolicy {
  readonly attempts: number
  readonly delayMs: number
}

export interface ModifyOptions {
  readonly retry?: RetryPolicy
}

const queues = new Map<string, Promise<unknown>>()

const withPathLock = <A>(filePath: string, f: () => Promise<A>): Promise<A> => {
  const prev = queues.get(filePath) ?? Promise.resolve()
  const next = prev.then(() => f()).finally(() => {
    if (queues.get(filePath) === next) {
      queues.delete(filePath)
    }
  })
  queues.set(filePath, next)
  return next as Promise<A>
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const readFileContents = async (filePath: string): Promise<string> => {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (e) {
    throw new FileSystemError(`read failed: ${filePath}`, e)
  }
}

const writeAtomic = async (filePath: string, contents: string): Promise<void> => {
  const dir = path.dirname(filePath)
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  )
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(tmp, "w", 0o600)
    await handle.writeFile(contents)
    await handle.sync()
  } catch (e) {
    throw new FileSystemError(`write failed: ${filePath}`, e)
  } finally {
    await handle?.close()
  }
  try {
    await fs.rename(tmp, filePath)
  } catch (e) {
    throw new FileSystemError(`rename failed: ${filePath}`, e)
  }
}

const tryModify = async (
  filePath: string,
  transform: (contents: string) => string
): Promise<ModifyOutcome> => {
  const base = await readFileContents(filePath)
  const updated = transform(base)
  const current = await readFileContents(filePath)

  if (current !== base) {
    return "dropped-conflict"
  }

  await writeAtomic(filePath, updated)
  return "saved"
}

const retryModify = async (
  filePath: string,
  transform: (contents: string) => string,
  policy: RetryPolicy,
  attempt = 0
): Promise<ModifyOutcome> => {
  if (attempt >= policy.attempts) {
    throw new ConflictExhausted(filePath)
  }

  await sleep(policy.delayMs)

  const outcome = await tryModify(filePath, transform)
  if (outcome === "saved") {
    return "saved"
  }

  return retryModify(filePath, transform, policy, attempt + 1)
}

export const modify = async (
  filePath: string,
  transform: (contents: string) => string,
  options?: ModifyOptions
): Promise<ModifyOutcome> =>
  withPathLock(filePath, async () => {
    const outcome = await tryModify(filePath, transform)
    if (outcome === "saved" || !options?.retry) {
      return outcome
    }
    return retryModify(filePath, transform, options.retry)
  })

export const read = async (filePath: string): Promise<string> => readFileContents(filePath)
