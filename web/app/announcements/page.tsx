import { PublicPageShell } from "@/components/PublicPageShell";
import { fetchAnnouncements } from "@/lib/announcements";

import { AnnouncementsView } from "./AnnouncementsView";

export const metadata = {
  title: "Announcements · nodosol",
  description:
    "Latest news, release notes, and status updates from the Nodosol team.",
};

// Server component — loads the feed at request time so the first
// paint already has content. RLS keeps drafts + scheduled-future +
// expired rows out of the result set.
export default async function AnnouncementsPage() {
  const rows = await fetchAnnouncements();
  return (
    <PublicPageShell active="announcements">
      <AnnouncementsView rows={rows} />
    </PublicPageShell>
  );
}
