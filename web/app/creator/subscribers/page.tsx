import { MarketplaceShell } from "@/components/MarketplaceShell";

import { SubscribersView } from "./SubscribersView";

export const metadata = {
  title: "Subscribers — nodosol",
  description:
    "List active and lapsed subscribers across your nodosol subscription plans.",
};

export default function SubscribersPage() {
  return (
    <MarketplaceShell active="creator-plans">
      <SubscribersView />
    </MarketplaceShell>
  );
}
