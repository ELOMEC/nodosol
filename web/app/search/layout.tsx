import type { ReactNode } from "react";

import { SearchProviders } from "./providers";

export default function SearchLayout({ children }: { children: ReactNode }) {
  return <SearchProviders>{children}</SearchProviders>;
}
