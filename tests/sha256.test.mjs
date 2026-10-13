import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256Hex } from "../js/core/sha256.js";

test("sha256 matches node:crypto across padding boundaries and unicode", () => {
  const samples = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(65), "a".repeat(1000), "naïve café ☕ 日本語 𝄞"];
  for (const s of samples) assert.equal(sha256Hex(s), createHash("sha256").update(s, "utf8").digest("hex"), JSON.stringify(s.slice(0, 20)));
});
