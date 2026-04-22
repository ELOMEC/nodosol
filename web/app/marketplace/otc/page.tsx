import { MarketplaceShell } from "@/components/MarketplaceShell";

import { OtcView } from "./OtcView";

export const metadata = {
  title: "OTC deals",
  description: "Peer-to-peer OTC trades with dual-party escrow. Set counterparty, price, expiry; accept is atomic.",
};

export default function OtcPage() {
  return (
    <MarketplaceShell active="otc">
      <OtcView />
    </MarketplaceShell>
  );
}
