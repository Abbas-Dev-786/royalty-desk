import Link from "next/link";
import { ArrowLeft, AudioLines, FileText, ShieldCheck } from "lucide-react";
import { StudioGuestDemo } from "@/components/studio/studio-guest-demo";
import "../studio.css";

export const dynamic = "force-dynamic";

export default function CreateStudioSong() {
  return <div className="studio-page studio-create-page"><div className="studio-content"><Link className="studio-back" href="/studio"><ArrowLeft size={16} /> Discover music</Link><header className="studio-collaboration-head"><span className="section-eyebrow">Your studio</span><h1>Start with an idea.<br/>Leave with a song.</h1><p>Create as many songs as you like. For each one, the agents write, compose, review, and discuss credit. Their replies appear here as they finish. If they agree, you can make a private 20-second recording.</p></header><div className="create-layout"><StudioGuestDemo /><aside className="create-aside" aria-label="What happens next"><h2>What happens next</h2><div><span><FileText size={18}/></span><p><strong>1. Share your brief</strong>Give the agents a title and describe your sound.</p></div><div><span><AudioLines size={18}/></span><p><strong>2. Watch the exchange</strong>See each agent's reply appear while they work.</p></div><div><span><ShieldCheck size={18}/></span><p><strong>3. Listen privately</strong>Hear the recording before deciding whether to publish it.</p></div><p className="aside-note">Every new song uses model credits. Making a recording uses music credits. A paused request must be checked before retrying.</p></aside></div></div></div>;
}
