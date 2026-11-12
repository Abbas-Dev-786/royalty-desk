import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";

const manifest = JSON.parse(readFileSync(resolve("private/studio-v2/testnet/bootstrap.json"), "utf8"));
const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
assert.equal(contractId, manifest.accountId, "Web and deployed contract IDs differ");
const rpc = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const code = await rpc.viewContractCode({ contractId, blockQuery: { finality: "final" } });
const wasmHash = createHash("sha256").update(code.code).digest("hex");
assert.equal(wasmHash, manifest.wasmHash, "Deployed code differs from recorded upgrade");
assert.equal(await rpc.callFunction({ contractId, method: "get_schema_version", args: {} }), 2);
const accounts = [`lyricist.${contractId}`, `composer.${contractId}`];
const works = ["song-phase03-1", "song-phase03-2", "album-phase03"];
for (const workId of works) {
  const release = await rpc.callFunction({ contractId, method: "get_release", args: { work_id: workId, version: 2 } });
  assert.ok(release?.published, `${workId} is not published`);
  for (const accountId of accounts) assert.equal(await rpc.callFunction({ contractId, method: "has_accepted_split", args: { work_id: workId, version: 2, account_id: accountId } }), true, `${workId} missing ${accountId} acceptance`);
  assert.equal(await rpc.callFunction({ contractId, method: "has_approved_release", args: { work_id: workId, version: 2, policy_epoch: release.policy_epoch } }), true, `${workId} missing historical approval`);
}
console.log(JSON.stringify({ status: "pass", contractId, schemaVersion: 2, wasmHash, worksChecked: works.length, acceptancesChecked: works.length * accounts.length, approvalsChecked: works.length }));
