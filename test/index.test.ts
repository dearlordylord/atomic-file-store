import { describe, it } from "@effect/vitest"
import * as assert from "node:assert"
import { name } from "../src/index.js"

describe("atomic-file-store", () => {
  it("exports the package name", () => {
    assert.strictEqual(name, "atomic-file-store")
  })
})
