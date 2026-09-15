import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { subscribePath } from "@/lib/api";

import { ActionScreen } from "./ActionScreen";
import { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Subscribe">;

export function SubscribeScreen({ route }: Props) {
  const { creator, planId } = route.params;
  return (
    <ActionScreen
      heading="Subscribe to plan"
      path={subscribePath(creator, planId)}
    />
  );
}
