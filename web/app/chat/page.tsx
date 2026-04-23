import type { Metadata } from "next";

import { MarketplaceShell } from "@/components/MarketplaceShell";
import { ChatPage } from "./ChatPage";

export const metadata: Metadata = {
  title: "Channels — Nodosol",
  description: "Public chat channels for Nodosol: help, showcases, deals.",
};

export default function Page() {
  return (
    <MarketplaceShell active="chat">
      <ChatPage />
    </MarketplaceShell>
  );
}
