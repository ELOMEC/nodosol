import { MarketplaceShell } from "@/components/MarketplaceShell";

import { AdminAnnouncementsView } from "./AdminAnnouncementsView";

export const metadata = {
  title: "Announcements admin · nodosol",
  robots: { index: false, follow: false },
};

export default function AdminAnnouncementsPage() {
  return (
    <MarketplaceShell active="admin">
      <AdminAnnouncementsView />
    </MarketplaceShell>
  );
}
