import Link from "next/link";
import { currentUser, getAppDatabase } from "@/server/runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";
import { yoctoToNear } from "@/lib/studio-money";
import { StudioGuardianControls } from "@/components/studio/studio-guardian-controls";

export const dynamic = "force-dynamic";

interface Agent { id: string; account_id: string; role: string; active: number; }
interface Work { work_id: string; version: number; title: string; kind: string; state: string; chain_tx_hash: string | null; }
interface ModelRun { agent_id: string; role: string; model: string; provider_mode: string; output_json: string; }
interface Order { payment_id: string; work_id: string; kind: string; status: string; amount_yocto: string; transaction_hash: string | null; }

export default async function StudioOperationsPage() {
  const user = await currentUser();
  if (!user) return <section className="studio-page"><h1>Studio governance</h1><p>Use <strong>Connect wallet</strong> in the upper right, choose the guardian testnet account, and sign the app login message. Reload this page after sign-in to see policy and agent renewal controls.</p><Link href="/studio">Explore published music</Link></section>;
  let chain;
  try {
    chain = studioContractClient();
    const guardian = await chain.guardian();
    if (user.accountId !== guardian) return <section className="studio-page"><h1>Studio governance</h1><p>Signed in as {user.accountId}. The emergency guardian is {guardian}.</p><p>Agents create and publish music. You can explore the catalogue and start a guest song.</p><Link href="/studio">Explore published music</Link></section>;
  } catch { return <section className="studio-page"><h1>Studio governance unavailable</h1><p>The NEAR contract could not be verified.</p></section>; }

  const database = openStudioCatalogueDatabase();
  let agents: Agent[], works: Work[], models: ModelRun[];
  try {
    agents = database.prepare("SELECT id, account_id, role, active FROM studio_agents ORDER BY role, account_id LIMIT 32").all() as unknown as Agent[];
    works = database.prepare("SELECT v.work_id, v.version, v.title, w.kind, v.state, p.chain_tx_hash FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id LEFT JOIN studio_publications p ON p.work_id = v.work_id AND p.work_version = v.version ORDER BY v.created_at_ms DESC LIMIT 40").all() as unknown as Work[];
    models = database.prepare("SELECT agent_id, role, model, provider_mode, output_json FROM studio_model_outputs ORDER BY created_at_ms DESC LIMIT 20").all() as unknown as ModelRun[];
  } finally { database.close(); }
  const orders = getAppDatabase().prepare("SELECT payment_id, work_id, kind, status, amount_yocto, transaction_hash FROM studio_orders ORDER BY created_at_ms DESC LIMIT 30").all() as unknown as Order[];
  const [policy, earnings, releases] = await Promise.all([chain.policy(), Promise.all(agents.map(async (agent) => ({ agent, balance: await chain.earnings(agent.account_id), identity: await chain.agent(agent.account_id) }))), Promise.all(works.map(async (work) => ({ work, release: await chain.release(work.work_id, work.version) })))]);

  return <div className="studio-page studio-operations">
    <header className="studio-operations-head"><div><p className="studio-kicker">NEAR testnet · guardian</p><h1>Studio governance</h1><p>Agents handle creation, split acceptance, publication, allocation and payouts. This wallet controls policy and emergency recovery.</p></div><Link href="/studio">Open catalogue</Link></header>
    <section className="studio-ops-section"><h2>Policy and emergencies</h2><p>Epoch {policy.epoch}. {policy.human_review ? "Human approval is required for publication." : "Agents can publish after split acceptance."} {policy.paused ? "The studio is paused." : "The studio is active."}</p><StudioGuardianControls contractId={chain.contractId} guardianId={user.accountId} policy={policy} agents={earnings.map(({ agent, identity }) => ({ accountId: agent.account_id, role: agent.role, active: Boolean(agent.active) && identity?.active === true, expiresAtMs: identity?.expires_at_ms ?? null, maxActions: identity?.max_actions ?? 0, actionsUsed: identity?.actions_used ?? 0 }))} releases={releases.filter((entry) => entry.release !== null).map(({ work, release }) => ({ workId: work.work_id, version: work.version, title: work.title, commitment: release!.commitment, policyEpoch: release!.policy_epoch, published: release!.published }))} /></section>
    <section className="studio-ops-section"><h2>Agent earnings</h2><div className="studio-ops-list">{earnings.map(({ agent, balance, identity }) => <div className="studio-ops-row" key={agent.id}><div><strong>{agent.role}</strong><small>{agent.account_id}</small><span>{identity?.active && agent.active ? "Active" : "Inactive"}{identity && ` · expires ${new Date(identity.expires_at_ms).toLocaleDateString("en-GB", { timeZone: "UTC" })} · ${identity.max_actions - identity.actions_used} actions left`}</span></div><div><span>Owed {yoctoToNear(balance.owed_yocto)} NEAR</span><span>Pending {yoctoToNear(balance.pending_yocto)} NEAR</span><span>Paid {yoctoToNear(balance.paid_yocto)} NEAR</span></div></div>)}</div></section>
    <section className="studio-ops-section"><h2>Works</h2><div className="studio-ops-list">{works.map((work) => <div className="studio-ops-row" key={`${work.work_id}:${work.version}`}><div><strong>{work.title}</strong><small>{work.kind} · version {work.version} · {work.work_id}</small></div><div><span>{work.chain_tx_hash ? "Published on NEAR" : work.state}</span>{work.chain_tx_hash && <a href={`https://testnet.nearblocks.io/txns/${work.chain_tx_hash}`} target="_blank" rel="noreferrer">Publication receipt</a>}</div></div>)}</div></section>
    <section className="studio-ops-section"><h2>Agent interactions</h2><div className="studio-ops-list">{models.map((run, index) => <div className="studio-ops-row" key={`${run.agent_id}:${index}`}><div><strong>{run.role} · {run.agent_id}</strong><small>{run.provider_mode} · {run.model}</small><pre className="studio-ops-output">{run.output_json.slice(0, 2500)}</pre></div></div>)}</div></section>
    <section className="studio-ops-section"><h2>Listener orders</h2><div className="studio-ops-list">{orders.map((order) => <div className="studio-ops-row" key={order.payment_id}><div><strong>{order.kind} · {order.work_id}</strong><small>{order.payment_id}</small></div><div><span>{order.status} · {yoctoToNear(order.amount_yocto)} NEAR</span>{order.transaction_hash && <a href={`https://testnet.nearblocks.io/txns/${order.transaction_hash}`} target="_blank" rel="noreferrer">Payment receipt</a>}</div></div>)}</div></section>
  </div>;
}
