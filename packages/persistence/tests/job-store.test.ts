import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openJobStore } from "../src/job-store.ts";

test("P00-PERSIST-01 queued jobs survive database restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "royaltydesk-persistence-"));
  const databasePath = join(directory, "jobs.sqlite");
  const digest = "a".repeat(64);

  const first = openJobStore(databasePath);
  first.enqueue({ id: "job-restart", releaseId: "release-1", inputDigest: digest }, 1_000);
  first.close();

  const second = openJobStore(databasePath);
  assert.deepEqual(second.get("job-restart"), {
    id: "job-restart",
    releaseId: "release-1",
    inputDigest: digest,
    state: "queued",
    leaseOwner: null,
    leaseExpiresAtMs: null,
    attempts: 0
  });
  second.close();
});

test("P00-PERSIST-02 only one active lease wins", () => {
  const store = openJobStore(":memory:");
  store.enqueue({ id: "job-lease", releaseId: "release-1", inputDigest: "b".repeat(64) }, 1_000);
  assert.equal(store.lease("job-lease", "worker-a", 2_000, 1_000)?.leaseOwner, "worker-a");
  assert.equal(store.lease("job-lease", "worker-b", 2_500, 1_000), undefined);
  assert.equal(store.lease("job-lease", "worker-b", 3_000, 1_000)?.leaseOwner, "worker-b");
  store.close();
});

test("P00-PERSIST-03 duplicate logical input is rejected", () => {
  const store = openJobStore(":memory:");
  const first = { id: "job-one", releaseId: "release-1", inputDigest: "c".repeat(64) };
  store.enqueue(first, 1_000);
  assert.throws(() => store.enqueue({ ...first, id: "job-two" }, 1_001));
  store.close();
});
