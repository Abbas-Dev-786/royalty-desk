import Link from "next/link";
import { ArrowUpRight, Headphones, Music2, Search, Sparkles } from "lucide-react";
import { catalogueSnapshot } from "@/server/studio-catalogue";
import { yoctoToNear } from "@/lib/studio-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudioNotice } from "@/components/studio/studio-notice";
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
  return <div className="studio-page">
    <section className="studio-hero" aria-labelledby="studio-title">
      <div className="studio-hero-copy"><span className="hero-note"><Sparkles size={15} /> A new kind of music studio</span><h1 id="studio-title">Ideas become songs here.</h1><p>Tell our agents what you hear in your head. They write, compose, review, and agree on credit. If they agree, you can hear a private recording first.</p><div className="hero-actions"><Link className="studio-button studio-button-warm" href="/studio/create">Create your song <ArrowUpRight size={18} /></Link><a className="studio-hero-text-link" href="#discover">Explore the music</a></div><p className="hero-footnote">Create more than one song · Listening is free</p></div>
      <div className="hero-visual" aria-hidden="true"><div className="hero-vinyl"><div className="hero-vinyl-label"><Music2 size={32} /><span>MAKE<br/>SOME<br/>NOISE</span></div></div><div className="hero-wave"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
    </section>
    <div className="studio-content">
      <section className="studio-intro" aria-label="How the studio works"><div><strong>01</strong><span>Describe your idea</span><p>Give the agents a title and a music brief.</p></div><div><strong>02</strong><span>Hear the collaboration</span><p>Follow their creative exchange and agreed split.</p></div><div><strong>03</strong><span>Play your recording</span><p>Listen privately before any public release.</p></div></section>
      <section id="discover" className="discover-section">
        <div className="section-title-row"><div><span className="section-eyebrow"><Headphones size={16}/> The listening room</span><h2>Discover music</h2><p>Every release is free to play. Buy a download or leave a tip if you want to support its makers.</p></div><span className="release-count">{filtered.length} {filtered.length === 1 ? "release" : "releases"}</span></div>
        <form className="studio-filter" action="/studio" method="get"><label htmlFor="studio-search"><Search size={18} /> <span className="sr-only">Find music</span></label><Input id="studio-search" name="q" defaultValue={query} placeholder="Search songs and albums" maxLength={80}/><select name="kind" defaultValue={kind} aria-label="Filter by type"><option value="all">All music</option><option value="song">Songs</option><option value="album">Albums</option></select><Button type="submit">Search</Button></form>
        {snapshot.staleCount > 0 && <StudioNotice className="catalogue-notice" notice={{ tone: "warning", title: "Some releases are temporarily hidden", description: `${snapshot.staleCount} release${snapshot.staleCount === 1 ? "" : "s"} could not be verified against the contract or media store. Please check again later.` }} />}
        {unavailable ? <StudioNotice className="catalogue-notice" notice={{ tone: "error", title: "The listening room is temporarily unavailable", description: "We could not verify the catalogue or its recordings. Refresh this page after testnet access returns." }} /> : filtered.length === 0 ? <div className="studio-empty"><div className="empty-record" aria-hidden="true"><Music2 size={35}/></div><h3>{query ? "No music matches your search" : "The first releases are on their way"}</h3><p>{query ? "Try a different title or show all music." : "The agents are making music now. You can start a private song while the catalogue grows."}</p><Link className="studio-button studio-button-dark" href={query ? "/studio" : "/studio/create"}>{query ? "Show all music" : "Create a song"}</Link></div> : <div className="studio-grid">{filtered.map((item) => <Link className="studio-tile" href={`/studio/${encodeURIComponent(item.workId)}?version=${item.version}`} key={`${item.workId}:${item.version}`}><div className="studio-art">{item.kind === "album" ? <img src={`/api/studio/media/${item.assetHash}`} alt={`${item.title} album cover`}/> : <span className="studio-disc" aria-hidden="true"/>}<span className="tile-play"><ArrowUpRight size={19}/></span></div><div className="studio-tile-info"><span>{item.kind === "album" ? `Album · ${item.tracks.length} tracks` : "Song · Free to play"}</span><h3>{item.title}</h3><p>Download for {yoctoToNear(item.priceYocto)} testnet NEAR</p></div></Link>)}</div>}
      </section>
    </div>
  </div>;
}
