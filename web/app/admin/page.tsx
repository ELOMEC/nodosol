import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AdminView } from "./AdminView";

export default function AdminPage() {
  return (
    <MarketplaceShell active="admin">
      <AdminView />
    </MarketplaceShell>
  );
}
