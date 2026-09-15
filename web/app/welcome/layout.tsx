import type { ReactNode } from "react";

import { WelcomeProviders } from "./providers";

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return <WelcomeProviders>{children}</WelcomeProviders>;
}
