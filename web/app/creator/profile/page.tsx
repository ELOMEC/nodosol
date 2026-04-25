import { MarketplaceShell } from "@/components/MarketplaceShell";

import { EditProfileView } from "./EditProfileView";

export const metadata = {
  title: "Public profile",
  description: "Claim your nodosol.com/c/<handle> URL — public profile shown to fans, supporters, and event attendees.",
};

export default function CreatorProfileEditPage() {
  return (
    <MarketplaceShell active="creator">
      <EditProfileView />
    </MarketplaceShell>
  );
}
