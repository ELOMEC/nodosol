import { MarketplaceShell } from "@/components/MarketplaceShell";

import { HistoryView } from "./HistoryView";

export const metadata = {
  title: "Purchase history — nodosol",
  description: "Tickets, subscriptions, OTC deals, and auction wins for your wallet.",
};

export default function AccountHistoryPage() {
  return (
    <MarketplaceShell active="history">
      <HistoryView />
    </MarketplaceShell>
  );
}
