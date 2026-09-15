import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { ticketPath } from "@/lib/api";

import { ActionScreen } from "./ActionScreen";
import { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Ticket">;

export function TicketScreen({ route }: Props) {
  const { creator, eventId } = route.params;
  return (
    <ActionScreen
      heading="Buy ticket"
      path={ticketPath(creator, eventId)}
    />
  );
}
