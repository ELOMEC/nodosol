import { getAppUrl } from "@/lib/constants";

import { ClientBlinkView } from "../../../ClientBlinkView";

type Props = { params: Promise<{ creator: string; planId: string }> };

export default async function Page({ params }: Props) {
  const { creator, planId } = await params;
  const actionUrl = `${getAppUrl()}/api/actions/subscribe/${creator}/${planId}`;
  return <ClientBlinkView actionUrl={actionUrl} />;
}
