import type { ReactNode } from "react";

import { CreatorProviders } from "./providers";

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return <CreatorProviders>{children}</CreatorProviders>;
}
