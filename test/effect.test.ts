import { describe, it } from "vitest"
import * as assert from "node:assert"
import * as fs from "node:fs/promises"
import * as fsSync from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { Effect, Schedule } from "effect"
import {
  modify,
  parseStateFilePath,
  persist,
  read,
  retryPolicy,
  StateFilePathSchema,
  StateFileLocksLive
} from "../src/effect.js"

const tmpFile = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-file-store-effect-"))
  return path.join(dir, "state.json")
}

describe("atomic-file-store/effect", () => {
  it("saves via Effect", async () => {
    const filePath = await tmpFile()
    await fs.writeFile(filePath, "initial", "utf8")

    const file = StateFilePathSchema.make(filePath)
    const outcome = await Effect.runPromise(Effect.provide(modify(file, () => Effect.succeed(persist("updated"))), StateFileLocksLive))

    assert.deepStrictEqual(outcome, { _tag: "saved", value: "updated" })
    assert.strictEqual(await fs.readFile(filePath, "utf8"), "updated")
  })

  it("reads via Effect", async () => {
    const filePath = await tmpFile()
    await fs.writeFile(filePath, "hello", "utf8")

    const file = StateFilePathSchema.make(filePath)
    const contents = await Effect.runPromise(Effect.provide(read(file), StateFileLocksLive))

    assert.strictEqual(contents, "hello")
  })

  it("retries via Schedule until convergence", async () => {
    const filePath = await tmpFile()
    await fs.writeFile(filePath, "base", "utf8")

    const file = StateFilePathSchema.make(filePath)
    let calls = 0
    const program = modify(file, () =>
      Effect.sync(() => {
        calls += 1
        if (calls === 1) {
          fsSync.writeFileSync(filePath, "external")
        }
        return persist("updated")
      })
    , retryPolicy(Schedule.recurs(3)))

    const outcome = await Effect.runPromise(Effect.provide(program, StateFileLocksLive))

    assert.deepStrictEqual(outcome, { _tag: "saved", value: "updated" })
    assert.strictEqual(calls, 2)
    assert.strictEqual(await fs.readFile(filePath, "utf8"), "updated")
  })

  it("parses and uses StateFilePath", async () => {
    const filePath = await tmpFile()

    const file = await Effect.runPromise(parseStateFilePath(filePath))
    const outcome = await Effect.runPromise(
      Effect.provide(modify(file, () => Effect.succeed(persist("created"))), StateFileLocksLive)
    )

    assert.deepStrictEqual(outcome, { _tag: "saved", value: "created" })
    assert.strictEqual(await fs.readFile(filePath, "utf8"), "created")
  })
})
