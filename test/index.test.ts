import { describe, it } from "vitest"
import * as assert from "node:assert"
import * as fs from "node:fs/promises"
import * as fsSync from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { modify, read, ConflictExhausted, FileSystemError } from "../src/index.js"

const tmpFile = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-file-store-"))
  return path.join(dir, "state.json")
}

describe("atomic-file-store", () => {
  it("writes the transformed contents", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "initial", "utf8")

    const outcome = await modify(file, () => "updated")

    assert.strictEqual(outcome, "saved")
    assert.strictEqual(await fs.readFile(file, "utf8"), "updated")
  })

  it("reads the file", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "hello", "utf8")

    const contents = await read(file)

    assert.strictEqual(contents, "hello")
  })

  it("reports a dropped-conflict when the file changes between reads", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "base", "utf8")

    const outcome = await modify(file, () => {
      fsSync.writeFileSync(file, "external")
      return "updated"
    })

    assert.strictEqual(outcome, "dropped-conflict")
    assert.strictEqual(await fs.readFile(file, "utf8"), "external")
  })

  it("retries against the fresh base and converges", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "base", "utf8")

    let calls = 0
    const outcome = await modify(
      file,
      () => {
        calls += 1
        if (calls === 1) {
          fsSync.writeFileSync(file, "external")
        }
        return "updated"
      },
      { retry: { attempts: 3, delayMs: 0 } }
    )

    assert.strictEqual(outcome, "saved")
    assert.strictEqual(calls, 2)
    assert.strictEqual(await fs.readFile(file, "utf8"), "updated")
  })

  it("throws ConflictExhausted when retries are exhausted", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "base", "utf8")

    let calls = 0
    const attempt = () =>
      modify(
        file,
        () => {
          calls += 1
          fsSync.writeFileSync(file, `external-${calls}`)
          return "updated"
        },
        { retry: { attempts: 1, delayMs: 0 } }
      )

    await assert.rejects(attempt, (e) => e instanceof ConflictExhausted)
    assert.strictEqual(calls, 2)
  })

  it("serializes concurrent modifies on the same path", async () => {
    const file = await tmpFile()
    await fs.writeFile(file, "", "utf8")

    const markers = ["a", "b", "c"]
    await Promise.all(
      markers.map((marker) =>
        modify(file, (contents) => {
          const set = new Set(contents.split(",").filter(Boolean))
          set.add(marker)
          return Array.from(set).sort().join(",")
        })
      )
    )

    const final = await fs.readFile(file, "utf8")
    assert.deepStrictEqual(final.split(",").sort(), markers.sort())
  })

  it("throws FileSystemError when the file does not exist", async () => {
    const file = path.join(os.tmpdir(), `atomic-file-store-missing-${Date.now()}.json`)

    await assert.rejects(read(file), (e) => e instanceof FileSystemError)
  })
})
