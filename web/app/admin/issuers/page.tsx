import { MarketplaceShell } from "@/components/MarketplaceShell";

import { IssuersView } from "./IssuersView";

export default function AdminIssuersPage() {
  return (
    <MarketplaceShell active="admin-issuers">
      <IssuersView />
    </MarketplaceShell>
  );
}
