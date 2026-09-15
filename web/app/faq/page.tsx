import { PublicPageShell } from "@/components/PublicPageShell";

import { FaqView } from "./FaqView";

export const metadata = {
  title: "FAQ · nodosol",
  description:
    "Frequently asked questions about Nodosol — what it is, how tips and tickets work, audit status, and what chains it supports.",
};

export default function FaqPage() {
  return (
    <PublicPageShell active="faq">
      <FaqView />
    </PublicPageShell>
  );
}
