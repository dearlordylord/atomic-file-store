import { describe, it } from "vitest"
import * as assert from "node:assert"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Effect } from "effect"
import { modify, read } from "../src/effect.js"

const tmpFile = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-file-store-effect-"))
  return path.join(dir, "state.json")
}

describe("atomic-file-store/effect", () => {
  it("saves via Effect", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "initial", "utf8")

    const outcome = await Effect.runPromise(modify(file, () => "updated"))

    assert.strictEqual(outcome, "saved")
    assert.strictEqual(await fs.readFile(file, "utf8"), "updated")
  })

  it("reads via Effect", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "hello", "utf8")

    const contents = await Effect.runPromise(read(file))

    assert.strictEqual(contents, "hello")
  })
})
