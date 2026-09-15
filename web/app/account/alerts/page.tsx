import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AlertsView } from "./AlertsView";

export const metadata = {
  title: "Price alerts — nodosol",
  description: "Get notified when a marketplace listing matches your saved query, max price, or category.",
};

export default function AccountAlertsPage() {
  return (
    <MarketplaceShell active="alerts">
      <AlertsView />
    </MarketplaceShell>
  );
}
