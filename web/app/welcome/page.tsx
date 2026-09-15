import { PublicPageShell } from "@/components/PublicPageShell";

import { WelcomeView } from "./WelcomeView";

export const metadata = {
  title: "Welcome — nodosol",
  description: "30-second onboarding for new Nodosol users.",
};

export default function WelcomePage() {
  return (
    <PublicPageShell active="home">
      <WelcomeView />
    </PublicPageShell>
  );
}
