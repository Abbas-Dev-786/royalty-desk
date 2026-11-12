import Link from "next/link";
import { notFound } from "next/navigation";
import { StudioCheckout } from "@/components/studio/studio-checkout";
import { currentUser } from "@/server/runtime";
import { hasStudioDownloadEntitlement } from "@/server/studio-entitlement";
import { listCatalogue } from "@/server/studio-catalogue";
import "../studio.css";

export const dynamic = "force-dynamic";
export default async function StudioWork({ params, searchParams }: { readonly params: Promise<{ workId: string }>; readonly searchParams: Promise<{ version?: string }> }) {
  const { workId } = await params;
  const version = Number((await searchParams).version ?? "0");
  const item = (await listCatalogue()).find((work) => work.workId === workId && work.version === version);
  if (!item) notFound();
  const user = await currentUser();
  const downloadable = new Set<string>();
  if (user) for (const song of item.kind === "song" ? [{ workId: item.workId, version: item.version }] : item.tracks) if (await hasStudioDownloadEntitlement(user.accountId, song.workId, song.version)) downloadable.add(`${song.workId}:${song.version}`);
  return <div className="studio-page studio-detail"><Link className="studio-back" href="/studio">← Back to music</Link><div className="studio-detail-head"><div className="studio-detail-art">{item.kind === "album" ? <img src={`/api/studio/media/${item.assetHash}`} alt={`${item.title} album cover`} /> : <span className="studio-disc" aria-hidden="true" />}</div><div><p className="studio-kicker">{item.kind === "album" ? "Album" : "Song"} · version {item.version}</p><h1>{item.title}</h1><p>Created by {item.credits.map((credit) => credit.accountId).join(" and ")}. Each share is recorded with this version.</p><StudioCheckout workId={item.workId} version={item.version} kind={item.kind} priceYocto={item.priceYocto} /></div></div>
    <section className="studio-listen"><h2>Listen</h2>{item.kind === "song" ? <div className="studio-track"><strong>{item.title}</strong><audio controls preload="metadata" src={`/api/studio/media/${item.assetHash}`} aria-label={`Play ${item.title}`} />{downloadable.has(`${item.workId}:${item.version}`) && <a href={`/api/studio/download/${encodeURIComponent(item.workId)}?version=${item.version}`}>Download MP3</a>}</div> : item.tracks.map((track, index) => <div className="studio-track" key={`${track.workId}:${track.version}`}><span className="studio-track-number">{index + 1}</span><strong>{track.title}</strong><audio controls preload="metadata" src={`/api/studio/media/${track.assetHash}`} aria-label={`Play ${track.title}`} />{downloadable.has(`${track.workId}:${track.version}`) && <a href={`/api/studio/download/${encodeURIComponent(track.workId)}?version=${track.version}`}>Download MP3</a>}</div>)}</section>
    <section className="studio-provenance"><h2>Release record</h2><dl><div><dt>Contract commitment</dt><dd>{item.commitment}</dd></div><div><dt>Media SHA-256</dt><dd>{item.assetHash}</dd></div></dl><p>Playback is free. Purchases support the agents on NEAR testnet. Refunds require an administrator correction before proceeds are allocated.</p></section>
  </div>;
}
