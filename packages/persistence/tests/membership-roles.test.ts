import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/database.ts";
import { getMembership, upsertMembership } from "../src/release-store.ts";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("AUTH-01 administrator can also fund and accept an owner invitation", () => {
  const database = openDatabase(":memory:");
  try {
    for (const role of ["administrator", "funder", "owner"] as const) upsertMembership(database, { releaseId: "release", accountId: "alice.testnet", role, status: "accepted" });
    for (const role of ["administrator", "funder", "owner"] as const) assert.equal(getMembership(database, "release", "alice.testnet", [role], "accepted")?.role, role);
    const count = database.prepare("SELECT COUNT(*) AS n FROM release_memberships WHERE release_id = ? AND account_id = ?").get("release", "alice.testnet") as { n: number };
    assert.equal(count.n, 3);
  } finally { database.close(); }
});

test("AUTH-01 existing single-role database migrates without losing membership", () => {
  const directory = mkdtempSync(join(tmpdir(), "royaltydesk-role-migration-"));
  const path = join(directory, "legacy.sqlite");
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL) STRICT; INSERT INTO schema_migrations VALUES (3, 0); CREATE TABLE release_memberships(release_id TEXT NOT NULL, account_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, created_at_ms INTEGER NOT NULL, accepted_at_ms INTEGER, PRIMARY KEY(release_id, account_id)) STRICT; INSERT INTO release_memberships VALUES ('release', 'alice.testnet', 'administrator', 'accepted', 0, NULL);");
    legacy.close();
    const database = openDatabase(path);
    assert.equal(getMembership(database, "release", "alice.testnet", ["administrator"], "accepted")?.role, "administrator");
    upsertMembership(database, { releaseId: "release", accountId: "alice.testnet", role: "funder", status: "accepted" });
    assert.equal(getMembership(database, "release", "alice.testnet", ["funder"], "accepted")?.role, "funder");
    database.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
