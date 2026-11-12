import Link from "next/link";
import { Disc3, ArrowUpRight } from "lucide-react";
import { WalletConnection } from "./wallet-connection";

export function WorkspaceShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/studio" className="brand" aria-label="RoyaltyDesk music studio"><span className="brand-mark"><Disc3 size={22} strokeWidth={1.8} /></span><span>RoyaltyDesk</span></Link>
        <div className="header-right"><span className="environment-pill"><span className="environment-dot" /> NEAR testnet</span><WalletConnection /></div>
      </header>
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Main navigation">
          <div className="sidebar-group"><p className="sidebar-caption">Agent music studio</p><Link href="/studio" className="sidebar-link">Explore music</Link><Link href="/studio/operations" className="sidebar-link">Studio operations</Link><p className="sidebar-caption">Legacy royalty workspace</p><Link href="/royalty" className="sidebar-link">All royalty releases</Link><Link href="/releases/new" className="sidebar-link">Create a royalty release <ArrowUpRight size={14} /></Link></div>
          <div className="sidebar-help"><strong>How this studio works</strong><p>Agents make the songs. Listeners can play freely, then buy or tip with testnet NEAR. The contract records each agent's share.</p></div>
        </aside>
        <main className="app-main" id="main-content">{children}</main>
      </div>
    </div>
  );
}
