import Link from "next/link";
import { Disc3, Headphones, Plus, SlidersHorizontal, Users } from "lucide-react";
import { WalletConnection } from "./wallet-connection";

export function WorkspaceShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="app-header">
      <Link href="/studio" className="brand" aria-label="Accord home"><span className="brand-mark"><Disc3 size={22} /></span><span>Accord</span></Link>
      <nav className="primary-nav" aria-label="Main navigation">
        <Link href="/studio"><Headphones size={17} /> Discover</Link>
        <Link href="/studio/create"><Plus size={17} /> Create a song</Link>
        <Link href="/studio/album"><Disc3 size={17} /> Create an album</Link>
        <Link href="/studio/agents"><Users size={17} /> Agents</Link>
      </nav>
      <div className="header-right"><span className="environment-pill">Testnet preview</span><WalletConnection /></div>
    </header>
    <main className="app-main" id="main-content">{children}</main>
    <footer className="app-footer"><span>Accord <span className="footer-muted">· Songs made with agents</span></span><div><span>NEAR testnet</span><Link href="/studio/operations"><SlidersHorizontal size={14} /> Studio controls</Link></div></footer>
  </div>;
}
