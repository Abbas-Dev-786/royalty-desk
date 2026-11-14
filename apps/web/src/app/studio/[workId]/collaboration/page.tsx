import Link from "next/link";
import { notFound } from "next/navigation";
import { listCatalogue } from "@/server/studio-catalogue";
import { publicStudioCollaboration } from "@/server/studio-collaboration";
import { AgentInteraction } from "@/components/studio/agent-interaction";
import "../../studio.css";

export const dynamic = "force-dynamic";

export default async function StudioCollaboration({ params, searchParams }: { readonly params: Promise<{ workId: string }>; readonly searchParams: Promise<{ version?: string }> }) {
  const { workId } = await params;
  const version = Number((await searchParams).version ?? "0");
  const item = (await listCatalogue()).find((work) => work.workId === workId && work.version === version);
  if (!item) notFound();
  const story = await publicStudioCollaboration(item);
  const releaseHref = `/studio/${encodeURIComponent(item.workId)}?version=${item.version}`;
  return <main className="studio-page studio-collaboration">
    <Link className="studio-back" href={releaseHref}>Back to {item.title}</Link>
    <header className="studio-collaboration-head"><p className="studio-kicker">Behind the song</p><h1>How {item.title} came together</h1><p>Follow the agents’ ideas, the recording, and the credit agreement behind this release.</p></header>
    <section className="studio-collab-section"><h2>The creative exchange</h2>{item.kind === "album" ? <p>This album brings together published songs. Open a track to read its own agent story.</p> : <>{story.steps.some((step) => step.source === "archived-concept") && <p>These earlier concepts are separate from the final recording.</p>}<AgentInteraction steps={story.steps} finalShares={story.splitAcceptances}/></>}</section>
    {item.kind === "album" && <section className="studio-collab-section"><h2>Track stories</h2><ul className="studio-collab-tracks">{item.tracks.map((track) => <li key={`${track.workId}:${track.version}`}><Link href={`/studio/${encodeURIComponent(track.workId)}/collaboration?version=${track.version}`}>{track.title} · version {track.version}</Link></li>)}</ul></section>}
    <section className="studio-collab-section"><h2>Who contributed</h2>{story.contributions.length ? <ul className="studio-collab-facts">{story.contributions.map((entry) => <li key={`${entry.agent_id}:${entry.kind}`}><strong>{entry.role}: {entry.account_id}</strong><details><summary>{entry.kind} contribution proof</summary><code>{entry.content_hash}</code></details></li>)}</ul> : <p>Individual contribution records were not saved for this release.</p>}{story.generation && <p>The {Math.round(story.generation.duration_ms / 1000)}-second recording was generated with {story.generation.provider}. The writing and recording were separate steps.</p>}</section>
    <section className="studio-collab-section"><h2>How the credit is shared</h2><p>These shares were accepted for this version and are used when purchases and tips are allocated.</p><ul className="studio-collab-facts">{story.splitAcceptances.map((share) => <li key={share.accountId}><strong>{share.accountId}</strong><span>{(share.basisPoints / 100).toFixed(2)}% · {share.acceptedOnChain ? "accepted on NEAR" : "acceptance not verified"}</span></li>)}</ul><details className="record-details"><summary>View NEAR release proof</summary><p>Version {item.version} · policy {story.policyEpoch}. {story.adminApprovedOnChain ? "Guardian approval recorded." : "No guardian approval record was found for this policy."}</p><p><a href={`https://testnet.nearblocks.io/address/${encodeURIComponent(process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID ?? "")}`} target="_blank" rel="noreferrer">Studio contract</a>{story.publicationHash && <> · <a href={`https://testnet.nearblocks.io/txns/${story.publicationHash}`} target="_blank" rel="noreferrer">Publication transaction</a></>}</p></details></section>
  </main>;
}
