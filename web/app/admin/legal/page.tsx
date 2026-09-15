import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AdminLegalListView } from "./AdminLegalListView";

export const metadata = {
  title: "Legal pages admin · nodosol",
  robots: { index: false, follow: false },
};

export default function AdminLegalPage() {
  return (
    <MarketplaceShell active="admin">
      <AdminLegalListView />
    </MarketplaceShell>
  );
}
