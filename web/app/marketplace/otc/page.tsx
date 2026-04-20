import { MarketplaceShell } from "@/components/MarketplaceShell";

import { OtcView } from "./OtcView";

export default function OtcPage() {
  return (
    <MarketplaceShell active="otc">
      <OtcView />
    </MarketplaceShell>
  );
}
