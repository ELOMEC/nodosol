import type { ReactNode } from "react";

import { MarketplaceProviders } from "./providers";

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return <MarketplaceProviders>{children}</MarketplaceProviders>;
}
