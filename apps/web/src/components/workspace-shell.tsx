import Link from "next/link";
import { Disc3, ArrowUpRight } from "lucide-react";
import { WalletConnection } from "./wallet-connection";

export function WorkspaceShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="brand" aria-label="RoyaltyDesk home"><span className="brand-mark"><Disc3 size={22} strokeWidth={1.8} /></span><span>RoyaltyDesk</span></Link>
        <div className="header-right"><span className="environment-pill"><span className="environment-dot" /> NEAR testnet</span><WalletConnection /></div>
      </header>
      <div className="app-body">
        <aside className="app-sidebar" aria-label="Main navigation">
          <div className="sidebar-group"><p className="sidebar-caption">Workspace</p><Link href="/" className="sidebar-link">All releases</Link><Link href="/releases/new" className="sidebar-link">Create a release <ArrowUpRight size={14} /></Link></div>
          <div className="sidebar-help"><strong>New to RoyaltyDesk?</strong><p>Start with a release. Owners then accept an invitation, agree on shares, and review each payment period.</p></div>
        </aside>
        <main className="app-main" id="main-content">{children}</main>
      </div>
    </div>
  );
}
