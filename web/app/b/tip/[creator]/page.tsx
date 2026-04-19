import { getAppUrl } from "@/lib/constants";

import { ClientBlinkView } from "../../ClientBlinkView";

type Props = { params: Promise<{ creator: string }> };

export default async function Page({ params }: Props) {
  const { creator } = await params;
  const actionUrl = `${getAppUrl()}/api/actions/tip/${creator}`;
  return <ClientBlinkView actionUrl={actionUrl} />;
}
