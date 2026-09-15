import type { Metadata } from "next";

import { MarketplaceShell } from "@/components/MarketplaceShell";

import { ChatPage } from "../../chat/ChatPage";

export const metadata: Metadata = {
  title: "Channels - Nodosol Ops",
  description:
    "Public chat channels for Nodosol from the Ops workspace.",
};

export default function OpsChannelsPage() {
  return (
    <MarketplaceShell active="chat">
      <ChatPage />
    </MarketplaceShell>
  );
}
