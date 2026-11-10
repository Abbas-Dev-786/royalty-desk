import { WalletProbe } from "../components/WalletProbe";
import { ReleaseConsole } from "../components/ReleaseConsole";
import { Badge } from "../components/ui/badge";

const foundations = [
  "Owner-approved agreement versions",
  "Release-scoped agent mandates",
  "Integer NEAR settlement accounting",
  "Receipt-backed payout status"
] as const;

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">RoyaltyDesk <Badge variant="outline">Testnet</Badge></p>
      <h1>Royalty administration with enforceable agent boundaries.</h1>
      <p className="lede">
        The implementation is being built around participant consent, deterministic accounting, and NEAR-enforced payouts.
      </p>
      <section aria-labelledby="foundation-heading">
        <h2 id="foundation-heading">The control surface</h2>
        <ul>
          {foundations.map((foundation) => <li key={foundation}>{foundation}</li>)}
        </ul>
        <WalletProbe />
      </section>
      <ReleaseConsole />
    </main>
  );
}

