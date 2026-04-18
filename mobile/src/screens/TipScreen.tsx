import { NativeStackScreenProps } from "@react-navigation/native-stack";

import { tipPath } from "@/lib/api";

import { ActionScreen } from "./ActionScreen";
import { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Tip">;

export function TipScreen({ route }: Props) {
  const { creator } = route.params;
  return (
    <ActionScreen
      heading="Tip creator"
      path={tipPath(creator)}
    />
  );
}
