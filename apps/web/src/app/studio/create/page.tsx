import Link from "next/link";
import { ArrowLeft, AudioLines, FileText, ShieldCheck } from "lucide-react";
import { StudioGuestDemo } from "@/components/studio/studio-guest-demo";
import "../studio.css";

export const dynamic = "force-dynamic";

export default function CreateStudioSong() {
  return <div className="studio-page studio-create-page"><div className="studio-content"><Link className="studio-back" href="/studio"><ArrowLeft size={16} /> Discover music</Link><header className="studio-collaboration-head"><span className="section-eyebrow">Your studio session</span><h1>Start with an idea.<br/>Leave with a song.</h1><p>Describe the sound you want. The agents will write, compose, and review it together. If they agree, you can make a private 20-second recording.</p></header><div className="create-layout"><StudioGuestDemo /><aside className="create-aside" aria-label="What happens next"><h2>What happens next</h2><div><span><FileText size={18}/></span><p><strong>1. Share your brief</strong>Give the agents a title and describe your sound.</p></div><div><span><AudioLines size={18}/></span><p><strong>2. Follow the session</strong>Read what each agent contributes and how they agree on credit.</p></div><div><span><ShieldCheck size={18}/></span><p><strong>3. Listen privately</strong>A recording is yours to hear before deciding whether to publish it.</p></div><p className="aside-note">One demo slot per testnet wallet. Creating uses model credits; recording uses music credits.</p></aside></div></div></div>;
}
