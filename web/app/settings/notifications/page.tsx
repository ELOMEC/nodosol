import { MarketplaceShell } from "@/components/MarketplaceShell";

import { SettingsView } from "./SettingsView";

export const metadata = {
  title: "Notification settings",
  description:
    "Choose which on-chain events trigger an email and where to deliver them.",
};

export default function NotificationSettingsPage() {
  return (
    <MarketplaceShell active="settings-notifications">
      <SettingsView />
    </MarketplaceShell>
  );
}
