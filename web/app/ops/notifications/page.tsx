import { MarketplaceShell } from "@/components/MarketplaceShell";

import { SettingsView } from "../../settings/notifications/SettingsView";

export const metadata = {
  title: "Notifications - Nodosol Ops",
  description:
    "Choose which Nodosol events trigger notifications from the Ops workspace.",
};

export default function OpsNotificationsPage() {
  return (
    <MarketplaceShell active="settings-notifications">
      <SettingsView />
    </MarketplaceShell>
  );
}
