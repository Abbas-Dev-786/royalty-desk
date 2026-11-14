import Link from "next/link";
import { ArrowUpRight, Disc3, Wallet } from "lucide-react";
import { yoctoToNear } from "@/lib/studio-money";
import { loadAgentDashboard, type AgentDashboardRow } from "@/server/studio-agent-dashboard";
import "../studio.css";
import "./agents.css";

export const dynamic = "force-dynamic";

const amount = (value: string | null): string => value === null ? "Unavailable" : `${yoctoToNear(value)} NEAR`;
const roleName = (role: string): string => role.charAt(0).toUpperCase() + role.slice(1);
const receipt = (hash: string): string => `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;

function AgentProfile({ agent }: { readonly agent: AgentDashboardRow }) {
  return <article className="agent-profile" id={agent.id}>
    <header className="agent-profile-head"><div className="agent-role-mark" aria-hidden="true">{agent.role.slice(0, 1).toUpperCase()}</div><div><h2>{roleName(agent.role)}</h2><a href={`https://testnet.nearblocks.io/address/${encodeURIComponent(agent.accountId)}`} target="_blank" rel="noreferrer">{agent.accountId} <ArrowUpRight size={14}/></a></div><span className={agent.active ? "agent-state active" : "agent-state"}>{agent.active ? "Active" : "Inactive"}</span></header>
    <div className="agent-balance-strip"><div><span><Wallet size={16}/> Wallet total</span><strong>{amount(agent.walletBalanceYocto)}</strong></div><div><span>Owed by studio</span><strong>{amount(agent.owedYocto)}</strong></div><div><span>Transfer pending</span><strong>{amount(agent.pendingYocto)}</strong></div><div><span>Paid by studio</span><strong>{amount(agent.paidYocto)}</strong></div></div>
    <div className="agent-ledger-grid"><section><h3>Earned from music</h3><p>Each amount is this agent's exact share of an allocated purchase or tip.</p>{agent.earnings.length ? <ol className="agent-ledger-list">{agent.earnings.map((earning) => <li key={`${earning.paymentId}:${earning.workId}`}><div><strong><Link href={`/studio/${encodeURIComponent(earning.workId)}`}>{earning.workTitle}</Link></strong><span>{earning.sourceTitle !== earning.workTitle ? `${earning.sourceTitle} album · ` : ""}{earning.kind === "tip" ? "Tip" : "Purchase"}</span></div><div><strong>{amount(earning.amountYocto)}</strong><small>{new Date(earning.occurredAtMs).toLocaleDateString("en-GB", { timeZone: "UTC" })}</small>{earning.transactionHash && <a href={receipt(earning.transactionHash)} target="_blank" rel="noreferrer">Payment receipt <ArrowUpRight size={13}/></a>}{earning.allocationHash && <a href={receipt(earning.allocationHash)} target="_blank" rel="noreferrer">Allocation receipt <ArrowUpRight size={13}/></a>}</div></li>)}</ol> : <p className="agent-ledger-empty">No allocated music payments in the recent history.</p>}</section>
      <section><h3>Wallet payouts</h3><p>A payout can combine earnings from several songs.</p>{agent.transfers.length ? <ol className="agent-ledger-list">{agent.transfers.map((transfer) => <li key={transfer.payoutId}><div><strong>{transfer.status === "paid" ? "Sent to wallet" : `Payout ${transfer.status}`}</strong><span>{transfer.payoutId}</span></div><div><strong>{amount(transfer.amountYocto)}</strong><small>Requested {new Date(transfer.occurredAtMs).toLocaleDateString("en-GB", { timeZone: "UTC" })}</small>{transfer.transactionHash && <a href={receipt(transfer.transactionHash)} target="_blank" rel="noreferrer">Payout transaction <ArrowUpRight size={13}/></a>}</div></li>)}</ol> : <p className="agent-ledger-empty">No studio payout transactions recorded yet.</p>}</section></div>
  </article>;
}

export default async function StudioAgentsPage() {
  let dashboard: Awaited<ReturnType<typeof loadAgentDashboard>>;
  try { dashboard = await loadAgentDashboard(); }
  catch { return <div className="studio-page agents-page"><div className="studio-content agents-unavailable"><h1>Agent accounts are unavailable</h1><p>We could not read the studio ledger or contract. Refresh when testnet access returns.</p><Link href="/studio">Back to Discover</Link></div></div>; }
  return <div className="studio-page agents-page"><div className="studio-content"><header className="agents-intro"><div><span className="agents-record-mark"><Disc3 size={23}/></span><h1>The agents behind the music.</h1><p>See where each song's purchase or tip was allocated, what the studio owes, and which payouts reached an agent's wallet.</p></div><div className="agents-intro-note"><strong>{dashboard.agents.length}</strong><span>studio agents on NEAR testnet</span></div></header><div className="agents-context"><p><strong>Wallet total</strong> is the account's current NEAR balance, including funds from outside this studio. <strong>Paid by studio</strong> is the contract's lifetime payout total.</p><p>Music earnings and payout transfers are separate records. One payout may cover several music events.</p></div>{dashboard.historyIncomplete && <p className="agents-history-warning" role="status">Some payments or payouts could not be verified on chain yet. Refresh to check again; unavailable entries are omitted.</p>}{dashboard.agents.length ? <div className="agent-profiles">{dashboard.agents.map((agent) => <AgentProfile key={agent.id} agent={agent}/>)}</div> : <p className="agent-ledger-empty">No agents are registered for this studio yet.</p>}<p className="agents-history-foot">Showing up to {dashboard.historyLimit} recent purchases or tips and {dashboard.historyLimit} payout requests. For complete account activity, open an agent's NEAR explorer link.</p></div></div>;
}
