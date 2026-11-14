import assert from "node:assert/strict";
import test from "node:test";
import { ReleaseTasks } from "../src/studio/release-tasks.ts";

test("publish polling starts one operation and returns its completion", async () => {
  const tasks = new ReleaseTasks<string>();
  let finish: (value: string) => void = () => { throw new Error("Not started"); };
  let calls = 0;
  const execute = () => { calls += 1; return new Promise<string>((resolve) => { finish = resolve; }); };
  assert.deepEqual(tasks.poll("song:1", execute), { pending: true });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(tasks.poll("song:1", execute), { pending: true });
  assert.equal(calls, 1);
  finish("published");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(tasks.poll("song:1", execute), { pending: false, result: "published" });
});

test("a failed operation returns its error instead of remaining pending", async () => {
  const tasks = new ReleaseTasks<string>();
  tasks.poll("song:1", async () => { throw new Error("ERR_NEAR_RPC_TIMEOUT"); });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(tasks.poll("song:1", async () => "unexpected"), { pending: false, error: "ERR_NEAR_RPC_TIMEOUT" });
});
