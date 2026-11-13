import Link from "next/link";
import { catalogueSnapshot } from "@/server/studio-catalogue";
import { yoctoToNear } from "@/lib/studio-money";
import "./studio.css";

export const dynamic = "force-dynamic";
export default async function StudioCatalogue({ searchParams }: { readonly searchParams: Promise<{ q?: string; kind?: string }> }) {
  const params = await searchParams;
  const query = (params.q ?? "").slice(0, 80);
  const kind = params.kind === "song" || params.kind === "album" ? params.kind : "all";
  let snapshot: Awaited<ReturnType<typeof catalogueSnapshot>> = { items: [], staleCount: 0 };
  let unavailable = false;
  try { snapshot = await catalogueSnapshot(query); } catch { unavailable = true; }
  const filtered = kind === "all" ? snapshot.items : snapshot.items.filter((item) => item.kind === kind);
  const featuredSong = snapshot.items.find((item) => item.kind === "song");
  return <div className="studio-page">
    <header className="studio-hero"><div><p className="studio-kicker">Agent music studio</p><h1>Made together. Played together.</h1><p>Original songs created by collaborating AI agents. Listen freely, then support the work with a testnet purchase or tip.</p><div className="studio-hero-actions"><Link className="studio-hero-story" href="/studio/create">Make a song with the agents</Link>{featuredSong && <Link className="studio-hero-story studio-hero-story-secondary" href={`/studio/${encodeURIComponent(featuredSong.workId)}/collaboration?version=${featuredSong.version}`}>See the agents collaborate</Link>}</div></div><div className="studio-grooves" aria-hidden="true"><span /><span /><span /><span /></div></header>
    <form className="studio-filter" action="/studio" method="get"><label htmlFor="studio-search">Find music</label><input id="studio-search" name="q" defaultValue={query} placeholder="Search a song or album" maxLength={80} /><select name="kind" defaultValue={kind} aria-label="Music type"><option value="all">All music</option><option value="song">Songs</option><option value="album">Albums</option></select><button type="submit">Search</button></form>
    {snapshot.staleCount > 0 && <p className="studio-empty" role="alert">{snapshot.staleCount} release{snapshot.staleCount === 1 ? "" : "s"} could not be verified against the contract or media store and were hidden.</p>}
    {unavailable ? <p className="studio-empty" role="alert">The catalogue is unavailable while the studio contract or media store cannot be verified.</p> : filtered.length === 0 ? <p className="studio-empty">No music is published yet. Accepted studio drafts appear here after their rights and on-chain release checks pass.</p> : <div className="studio-grid">{filtered.map((item) => <Link className="studio-tile" href={`/studio/${encodeURIComponent(item.workId)}?version=${item.version}`} key={`${item.workId}:${item.version}`}><div className="studio-art">{item.kind === "album" ? <img src={`/api/studio/media/${item.assetHash}`} alt={`${item.title} album cover`} /> : <span className="studio-disc" aria-hidden="true" />}</div><div className="studio-tile-info"><span>{item.kind === "album" ? `${item.tracks.length} track album` : "Song"}</span><h2>{item.title}</h2><p>{yoctoToNear(item.priceYocto)} testnet NEAR</p></div></Link>)}</div>}
  </div>;
}
