import { getAppUrl } from "@/lib/constants";

import { ClientBlinkView } from "../../../ClientBlinkView";

type Props = { params: Promise<{ creator: string; eventId: string }> };

export default async function Page({ params }: Props) {
  const { creator, eventId } = await params;
  const actionUrl = `${getAppUrl()}/api/actions/ticket/${creator}/${eventId}`;
  return <ClientBlinkView actionUrl={actionUrl} />;
}
