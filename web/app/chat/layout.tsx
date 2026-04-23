import type { ReactNode } from "react";

import { ChatProviders } from "./providers";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatProviders>{children}</ChatProviders>;
}
