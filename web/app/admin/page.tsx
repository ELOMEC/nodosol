import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AdminView } from "./AdminView";

export const metadata = {
  title: "Admin",
  description: "Multisig-authority tooling — update fee_bps, rotate treasury, initialize configs across 9 Nodosol programs.",
};

export default function AdminPage() {
  return (
    <MarketplaceShell active="admin">
      <AdminView />
    </MarketplaceShell>
  );
}
