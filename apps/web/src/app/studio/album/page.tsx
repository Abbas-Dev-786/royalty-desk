import Link from "next/link";
import { ArrowLeft, AudioLines, Disc3, MessagesSquare, ShieldCheck } from "lucide-react";
import { StudioAlbumEntry } from "@/components/studio/studio-album-entry";
import "../studio.css";

export const dynamic = "force-dynamic";

export default function CreateStudioAlbum() {
  return <div className="studio-page studio-create-page"><div className="studio-content"><Link className="studio-back" href="/studio"><ArrowLeft size={16}/> Discover music</Link><header className="studio-collaboration-head"><span className="section-eyebrow">Your album studio</span><h1>One idea.<br/>Two original songs.</h1><p>Give the agents an album concept. They will write and negotiate each track, make both recordings, and assemble a private album you can hear before any public release.</p></header><div className="create-layout"><StudioAlbumEntry/><aside className="create-aside" aria-label="Album creation steps"><h2>How it works</h2><div><span><MessagesSquare size={18}/></span><p><strong>1. Share your concept</strong>Choose a title, story, and sound for the album.</p></div><div><span><AudioLines size={18}/></span><p><strong>2. Hear both tracks</strong>Three agents collaborate on two distinct full songs.</p></div><div><span><Disc3 size={18}/></span><p><strong>3. Review your album</strong>Play both private recordings and see the finished cover.</p></div><p className="aside-note"><ShieldCheck size={14}/> A connected NEAR testnet wallet is required. Two agent sessions and recordings use provider credits. Public release remains subject to studio review and approval.</p></aside></div></div></div>;
}
