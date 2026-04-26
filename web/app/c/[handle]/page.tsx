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
  const ogImage = profile.banner_url || profile.avatar_url || undefined;
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
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
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
