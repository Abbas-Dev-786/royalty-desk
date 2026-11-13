import Link from "next/link";
import { notFound } from "next/navigation";
import { listCatalogue } from "@/server/studio-catalogue";
import { publicStudioCollaboration } from "@/server/studio-collaboration";
import "../../studio.css";

export const dynamic = "force-dynamic";
const roleName: Readonly<Record<string, string>> = { lyrics: "Lyricist wrote", composition: "Composer shaped the sound", review: "Reviewer responded", revision: "Agent revised", split_proposal: "Lyricist proposed a split", split_response: "Composer answered the split" };

export default async function StudioCollaboration({ params, searchParams }: { readonly params: Promise<{ workId: string }>; readonly searchParams: Promise<{ version?: string }> }) {
  const { workId } = await params;
  const version = Number((await searchParams).version ?? "0");
  const item = (await listCatalogue()).find((work) => work.workId === workId && work.version === version);
  if (!item) notFound();
  const story = await publicStudioCollaboration(item);
  const releaseHref = `/studio/${encodeURIComponent(item.workId)}?version=${item.version}`;
  return <main className="studio-page studio-collaboration">
    <Link className="studio-back" href={releaseHref}>Back to {item.title}</Link>
    <header className="studio-collaboration-head"><p className="studio-kicker">Public production record</p><h1>How {item.title} came together</h1><p>See the recorded creative steps and the split each contributor accepted. This page shows published work only; draft prompts and private files stay in the studio.</p></header>
    <section className="studio-collab-section"><h2>Agent exchange</h2>{item.kind === "album" ? <p>This album groups two published songs. Open each track’s production record to see its agents’ creative steps.</p> : story.steps.length ? <><p>{story.steps.some((step) => step.source === "archived-concept") ? "These are archived NEAR AI concepts from the project. They show agent discussion, but are not a transcript of the final audio generation." : "These steps are linked to this release by source hashes saved in its metadata."}</p><ol className="studio-collab-timeline">{story.steps.map((step, index) => <li key={`${step.outputHash}:${index}`}><div><strong>{roleName[step.role] ?? step.role}</strong><small>{step.agentId} · {step.model} · {step.source === "archived-concept" ? "archived concept" : "release linked"}</small></div><blockquote>{step.excerpt}{step.excerpt.length === 900 ? "…" : ""}</blockquote><details><summary>Source hash</summary><code>{step.outputHash}</code></details></li>)}</ol></> : <p>No shareable agent dialogue was retained for this published version. The contribution and on-chain split records are available below.</p>}</section>
    {item.kind === "album" && <section className="studio-collab-section"><h2>Track stories</h2><ul className="studio-collab-tracks">{item.tracks.map((track) => <li key={`${track.workId}:${track.version}`}><Link href={`/studio/${encodeURIComponent(track.workId)}/collaboration?version=${track.version}`}>{track.title} · version {track.version}</Link></li>)}</ul></section>}
    <section className="studio-collab-section"><h2>Contributions and recording</h2>{story.contributions.length ? <ul className="studio-collab-facts">{story.contributions.map((entry) => <li key={`${entry.agent_id}:${entry.kind}`}><strong>{entry.role}: {entry.account_id}</strong><span>{entry.kind} contribution · content hash {entry.content_hash}</span></li>)}</ul> : <p>Individual contribution hashes were not retained for this version.</p>}{story.generation && <p>The recording was generated with {story.generation.provider} ({story.generation.model}), {Math.round(story.generation.duration_ms / 1000)} seconds. Creative text and audio generation are separate steps.</p>}</section>
    <section className="studio-collab-section"><h2>Agreement on NEAR</h2><p>Release version {item.version} was published under policy epoch {story.policyEpoch}. The committed split determines how this version’s proceeds are allocated.</p><ul className="studio-collab-facts">{story.splitAcceptances.map((share) => <li key={share.accountId}><strong>{share.accountId}</strong><span>{(share.basisPoints / 100).toFixed(2)}% · {share.acceptedOnChain ? "accepted on-chain" : "acceptance not verified"}</span></li>)}</ul><p>{story.adminApprovedOnChain ? "The guardian approved this release on-chain." : "No guardian approval record was found for this release policy; autonomous publication may apply."}</p><p><a href={`https://testnet.nearblocks.io/address/${encodeURIComponent(process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID ?? "")}`} target="_blank" rel="noreferrer">Inspect studio contract</a>{story.publicationHash && <> · <a href={`https://testnet.nearblocks.io/txns/${story.publicationHash}`} target="_blank" rel="noreferrer">Publication transaction</a></>}</p></section>
  </main>;
}
