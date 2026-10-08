import test from "node:test";
import assert from "node:assert/strict";
import { splitText, TELEGRAM_TEXT_LIMIT } from "../src/split.js";

test("keeps short text in one message", () => {
  assert.deepEqual(splitText("hello"), ["hello"]);
});

test("splits long text without exceeding the chosen limit", () => {
  const input = `${"a".repeat(25)}\n\n${"b".repeat(25)}`;
  const chunks = splitText(input, 30);
  assert.equal(chunks.join("\n\n"), input);
  assert.ok(chunks.every((chunk) => chunk.length <= 30));
});

test("rejects limits above Telegram's maximum", () => {
  assert.throws(() => splitText("hello", TELEGRAM_TEXT_LIMIT + 1));
});
