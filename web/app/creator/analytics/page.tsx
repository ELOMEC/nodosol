import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AnalyticsView } from "./AnalyticsView";

export const metadata = {
  title: "Analytics — nodosol",
  description:
    "Tip volume, recent activity, and revenue export for your nodosol creator account.",
};

export default function CreatorAnalyticsPage() {
  return (
    <MarketplaceShell active="creator-tips">
      <AnalyticsView />
    </MarketplaceShell>
  );
}
