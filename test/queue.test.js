import test from "node:test";
import assert from "node:assert/strict";
import { SerialQueue } from "../src/queue.js";

test("runs tasks serially in arrival order", async () => {
  const queue = new SerialQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  queue.add(async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
  });
  queue.add(async () => {
    events.push("second");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["first:start", "first:end", "second"]);
});
