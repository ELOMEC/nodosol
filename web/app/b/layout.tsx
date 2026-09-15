import type { ReactNode } from "react";

import { BlinkProviders } from "./providers";

export default function BlinkLayout({ children }: { children: ReactNode }) {
  return <BlinkProviders>{children}</BlinkProviders>;
}
