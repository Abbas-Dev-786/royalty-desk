import Link from "next/link";
import { currentUser, getAppDatabase } from "@/server/runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";
import { yoctoToNear } from "@/lib/studio-money";
import { StudioAdminControls } from "@/components/studio/studio-admin-controls";
import { StudioCreativeControls } from "@/components/studio/studio-creative-controls";
import { StudioDraftReviewControls } from "@/components/studio/studio-draft-review-controls";

export const dynamic = "force-dynamic";

interface AgentRow { id: string; account_id: string; role: string; active: number; }
interface WorkRow { work_id: string; project_id: string; version: number; current_version: number; title: string; kind: string; state: string; chain_tx_hash: string | null; }
interface TaskRow { kind: string; status: string; agent_id: string; }
interface ModelRow { agent_id: string; role: string; model: string; provider_mode: string; output_json: string; }
interface ContributionRow { work_id: string; work_version: number; agent_id: string; kind: string; content_hash: string; }
interface GenerationRow { work_id: string; work_version: number; agent_id: string; provider: string; model: string; asset_hash: string; }
interface AcceptanceRow { work_id: string; work_version: number; agent_id: string; split_hash: string; }
interface OrderRow { payment_id: string; work_id: string; kind: string; status: string; amount_yocto: string; transaction_hash: string | null; }
interface ProjectRow { id: string; title: string; status: string; }

export default async function StudioOperationsPage() {
  const user = await currentUser();
  if (!user) return <section className="studio-page"><h1>Studio operations</h1><p>Connect and sign in with the studio administrator wallet to view private work and payments.</p><Link href="/studio">Explore published music</Link></section>;
  let chain;
  try { chain = studioContractClient(); if (user.accountId !== await chain.admin()) return <section className="studio-page"><h1>Studio operations</h1><p>This workspace is available to the studio administrator only.</p><Link href="/studio">Explore published music</Link></section>; }
  catch { return <section className="studio-page"><h1>Studio operations unavailable</h1><p>The NEAR testnet contract could not be verified. Check the RPC connection and retry.</p></section>; }
  const database = openStudioCatalogueDatabase();
  let agents: AgentRow[];
  let works: WorkRow[];
  let tasks: TaskRow[];
  let models: ModelRow[];
  let contributions: ContributionRow[];
  let generations: GenerationRow[];
  let acceptances: AcceptanceRow[];
  let projects: ProjectRow[];
  try {
    agents = database.prepare("SELECT id, account_id, role, active FROM studio_agents ORDER BY role, account_id LIMIT 32").all() as unknown as AgentRow[];
    works = database.prepare("SELECT v.work_id, w.project_id, w.current_version, v.version, v.title, w.kind, v.state, p.chain_tx_hash FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id LEFT JOIN studio_publications p ON p.work_id = v.work_id AND p.work_version = v.version ORDER BY v.created_at_ms DESC LIMIT 40").all() as unknown as WorkRow[];
    tasks = database.prepare("SELECT kind, status, agent_id FROM studio_tasks ORDER BY created_at_ms DESC LIMIT 30").all() as unknown as TaskRow[];
    models = database.prepare("SELECT agent_id, role, model, provider_mode, output_json FROM studio_model_outputs ORDER BY created_at_ms DESC LIMIT 20").all() as unknown as ModelRow[];
    contributions = database.prepare("SELECT work_id, work_version, agent_id, kind, content_hash FROM studio_contributions ORDER BY accepted_at_ms DESC LIMIT 30").all() as unknown as ContributionRow[];
    generations = database.prepare("SELECT work_id, work_version, agent_id, provider, model, asset_hash FROM studio_audio_generations ORDER BY created_at_ms DESC LIMIT 20").all() as unknown as GenerationRow[];
    acceptances = database.prepare("SELECT work_id, work_version, agent_id, split_hash FROM studio_split_acceptances ORDER BY accepted_at_ms DESC LIMIT 30").all() as unknown as AcceptanceRow[];
    projects = database.prepare("SELECT id, title, status FROM studio_projects ORDER BY created_at_ms DESC LIMIT 20").all() as unknown as ProjectRow[];
  } finally { database.close(); }
  const orders = getAppDatabase().prepare("SELECT payment_id, work_id, kind, status, amount_yocto, transaction_hash FROM studio_orders ORDER BY created_at_ms DESC LIMIT 30").all() as unknown as OrderRow[];
  const [policy, earnings, releases] = await Promise.all([chain.policy(), Promise.all(agents.map(async (agent) => ({ agent, state: await chain.earnings(agent.account_id) }))), Promise.all(works.map(async (work) => ({ work, state: await chain.release(work.work_id, work.version) })))]);
  return <div className="studio-page studio-operations">
    <header className="studio-operations-head"><div><p className="studio-kicker">NEAR testnet · administrator</p><h1>Studio operations</h1><p>Review the agents, releases, sales and earnings before changing the on-chain policy.</p></div><Link href="/studio">Open catalogue</Link></header>
    <section className="studio-ops-section"><h2>Policy and transfers</h2><p>On-chain epoch {policy.epoch}. {policy.human_review ? "Human approval is required for releases." : "Agents can publish autonomously after their split acceptances."} {policy.paused ? "New activity is paused." : "The studio is active."}</p><StudioAdminControls contractId={chain.contractId} adminId={user.accountId} policy={policy} agents={earnings.map(({ agent, state }) => ({ accountId: agent.account_id, role: agent.role, owedYocto: state.owed_yocto, pendingYocto: state.pending_yocto, paidYocto: state.paid_yocto }))} drafts={releases.filter(({ work, state }) => work.state === "accepted" && work.version === work.current_version && state === null).map(({ work }) => ({ workId: work.work_id, version: work.version, title: work.title, kind: work.kind }))} releases={releases.filter((entry) => entry.state !== null).map(({ work, state }) => ({ workId: work.work_id, version: work.version, title: work.title, commitment: state!.commitment, policyEpoch: state!.policy_epoch, published: state!.published }))} /></section>
    <section className="studio-ops-section"><h2>Agents and earnings</h2><div className="studio-ops-list">{earnings.map(({ agent, state }) => <div className="studio-ops-row" key={agent.id}><div><strong>{agent.role}</strong><small>{agent.account_id}</small><span>{agent.active ? "Active" : "Inactive"}</span></div><div><span>Owed {yoctoToNear(state.owed_yocto)} NEAR</span><span>Pending {yoctoToNear(state.pending_yocto)} NEAR</span><span>Paid {yoctoToNear(state.paid_yocto)} NEAR</span></div></div>)}</div></section>
    <section className="studio-ops-section"><h2>Creative projects</h2><StudioCreativeControls agents={agents.map((agent) => ({ id: agent.id, role: agent.role, accountId: agent.account_id }))} projects={projects} songs={works.filter((work) => work.kind === "song" && work.version === work.current_version && ["review", "accepted"].includes(work.state)).map((work) => ({ workId: work.work_id, projectId: work.project_id, title: work.title, version: work.version }))} /></section>
    <section className="studio-ops-section"><h2>Works and review queue</h2><div className="studio-ops-list">{works.map((work) => <div className="studio-ops-row" key={`${work.work_id}:${work.version}`}><div><strong>{work.title}</strong><small>{work.kind} · version {work.version} · {work.work_id}</small></div><div><span>{work.chain_tx_hash ? "Published on NEAR" : work.state}</span>{work.chain_tx_hash && <a href={`https://testnet.nearblocks.io/txns/${work.chain_tx_hash}`} target="_blank" rel="noreferrer">Publication receipt</a>}</div></div>)}</div></section>
    {works.some((work) => work.state === "review" && work.version === work.current_version) && <section className="studio-ops-section"><h2>Private media review</h2><StudioDraftReviewControls drafts={works.filter((work) => work.state === "review" && work.version === work.current_version).map((work) => ({ workId: work.work_id, version: work.version, title: work.title, kind: work.kind, state: work.state }))} reviewers={agents.filter((agent) => agent.role === "reviewer" && agent.active).map((agent) => ({ id: agent.id, accountId: agent.account_id }))} /></section>}
    <section className="studio-ops-section"><h2>Task board</h2>{tasks.length ? <div className="studio-ops-list">{tasks.map((task, index) => <div className="studio-ops-row" key={`${task.agent_id}:${task.kind}:${index}`}><strong>{task.kind}</strong><span>{task.status} · {task.agent_id}</span></div>)}</div> : <p>No queued tasks in this studio snapshot.</p>}</section>
    <section className="studio-ops-section"><h2>Model activity and drafts</h2>{models.length ? <div className="studio-ops-list">{models.map((run, index) => <div className="studio-ops-row" key={`${run.agent_id}:${index}`}><div><strong>{run.role} · {run.agent_id}</strong><small>{run.provider_mode === "fixture" ? "Fixture output" : "Live NEAR AI output"} · {run.model}</small><pre className="studio-ops-output">{run.output_json.slice(0, 2500)}</pre></div></div>)}</div> : <p>No model runs in this studio snapshot.</p>}</section>
    <section className="studio-ops-section"><h2>Agent contributions and accepted splits</h2>{contributions.length ? <div className="studio-ops-list">{contributions.map((entry) => <div className="studio-ops-row" key={`${entry.work_id}:${entry.work_version}:${entry.agent_id}:${entry.kind}`}><div><strong>{entry.kind} · {entry.agent_id}</strong><small>{entry.work_id} v{entry.work_version} · content {entry.content_hash}</small></div><span>Local accepted contribution</span></div>)}</div> : <p>No accepted contributions are recorded.</p>}{acceptances.length ? <div className="studio-ops-list">{acceptances.map((entry) => <div className="studio-ops-row" key={`${entry.work_id}:${entry.work_version}:${entry.agent_id}`}><div><strong>Split accepted · {entry.agent_id}</strong><small>{entry.work_id} v{entry.work_version} · split {entry.split_hash}</small></div><span>Local acceptance record</span></div>)}</div> : <p>No local split acceptances are recorded.</p>}</section>
    <section className="studio-ops-section"><h2>Music generation</h2>{generations.length ? <div className="studio-ops-list">{generations.map((run) => <div className="studio-ops-row" key={run.asset_hash}><div><strong>{run.work_id} v{run.work_version}</strong><small>{run.agent_id} · asset {run.asset_hash}</small></div><span>{run.provider} · {run.model}</span></div>)}</div> : <p>No generated media is recorded in this studio snapshot.</p>}</section>
    <section className="studio-ops-section"><h2>Listener orders</h2>{orders.length ? <div className="studio-ops-list">{orders.map((order) => <div className="studio-ops-row" key={order.payment_id}><div><strong>{order.kind} · {order.work_id}</strong><small>{order.payment_id}</small></div><div><span>{order.status} · {yoctoToNear(order.amount_yocto)} NEAR</span>{order.transaction_hash && <a href={`https://testnet.nearblocks.io/txns/${order.transaction_hash}`} target="_blank" rel="noreferrer">Payment receipt</a>}</div></div>)}</div> : <p>No browser orders have been recorded in this app database.</p>}</section>
  </div>;
}
