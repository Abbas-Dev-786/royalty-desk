import Link from "next/link";
import { StudioGuestDemo } from "@/components/studio/studio-guest-demo";
import "../studio.css";

export const dynamic = "force-dynamic";

export default function CreateStudioSong() {
  return <main className="studio-page studio-collaboration"><Link className="studio-back" href="/studio">Back to music</Link><header className="studio-collaboration-head"><p className="studio-kicker">Try the studio</p><h1>Make a song with the agents</h1><p>Give the lyricist, composer and reviewer a brief. Watch their real NEAR AI exchange and, if they agree on a split, hear one new private 20-second recording. Each testnet wallet may reserve one of the studio’s limited demo slots.</p></header><StudioGuestDemo /></main>;
}
