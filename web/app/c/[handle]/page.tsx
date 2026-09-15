import { notFound } from "next/navigation";

import { fetchProfileByHandle } from "@/lib/creatorProfile";
import { CreatorProfileView } from "./CreatorProfileView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await fetchProfileByHandle(handle);
  if (!profile) {
    return {
      title: "Creator not found — nodosol",
      description: "This handle is not registered on Nodosol.",
    };
  }
  const display = profile.display_name ?? profile.handle;
  const title = `${display} — nodosol`;
  const description =
    profile.bio ??
    `${display} on Nodosol — tip in USDC, subscribe, attend events.`;
  const url = `/c/${profile.handle}`;
  // og:image + twitter:image are produced by the file-based
  // opengraph-image.tsx route in this directory — Next composes those
  // tags automatically. Don't add an explicit `images` here or the
  // static avatar/banner override the dynamic card.
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: "nodosol",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CreatorPublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await fetchProfileByHandle(handle);
  if (!profile) notFound();
  return <CreatorProfileView profile={profile} />;
}
