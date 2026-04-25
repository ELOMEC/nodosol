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
  const title = `${profile.display_name ?? profile.handle} — nodosol`;
  const description =
    profile.bio ??
    `${profile.display_name ?? profile.handle} on Nodosol — tip in USDC, subscribe, attend events.`;
  return { title, description };
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
