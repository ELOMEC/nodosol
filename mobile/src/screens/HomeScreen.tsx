import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/lib/theme";

import { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const [creator, setCreator] = useState("");
  const [planId, setPlanId] = useState("1");
  const [eventId, setEventId] = useState("1");

  const trimmed = creator.trim();
  const hasCreator = trimmed.length > 0;

  return (
    <Screen>
      <View>
        <Text style={styles.brand}>nodosol</Text>
        <Text style={styles.tagline}>creator economy on Solana</Text>
      </View>

      <Card title="Creator">
        <TextInput
          placeholder="Creator wallet address"
          placeholderTextColor={colors.dimText}
          autoCapitalize="none"
          autoCorrect={false}
          value={creator}
          onChangeText={setCreator}
          style={styles.input}
        />
      </Card>

      <Card title="Actions">
        <PrimaryButton
          label="Tip"
          onPress={() => navigation.navigate("Tip", { creator: trimmed })}
          disabled={!hasCreator}
        />
        <View style={styles.row}>
          <TextInput
            placeholder="plan id"
            placeholderTextColor={colors.dimText}
            keyboardType="numeric"
            value={planId}
            onChangeText={setPlanId}
            style={[styles.input, styles.idInput]}
          />
          <View style={styles.growing}>
            <PrimaryButton
              label={`Subscribe #${planId || "?"}`}
              onPress={() =>
                navigation.navigate("Subscribe", {
                  creator: trimmed,
                  planId: planId || "1",
                })
              }
              disabled={!hasCreator || !planId}
              variant="secondary"
            />
          </View>
        </View>
        <View style={styles.row}>
          <TextInput
            placeholder="event id"
            placeholderTextColor={colors.dimText}
            keyboardType="numeric"
            value={eventId}
            onChangeText={setEventId}
            style={[styles.input, styles.idInput]}
          />
          <View style={styles.growing}>
            <PrimaryButton
              label={`Buy ticket #${eventId || "?"}`}
              onPress={() =>
                navigation.navigate("Ticket", {
                  creator: trimmed,
                  eventId: eventId || "1",
                })
              }
              disabled={!hasCreator || !eventId}
              variant="secondary"
            />
          </View>
        </View>
      </Card>

      <Text style={styles.footer}>
        Flows hand off to a Solana wallet (Phantom, Backpack) via a{" "}
        <Text style={styles.mono}>solana-action:</Text> deep link.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: {
    color: colors.mutedText,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: "#1D1D1D",
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "stretch",
  },
  idInput: {
    width: 80,
    textAlign: "center",
  },
  growing: {
    flex: 1,
  },
  footer: {
    color: colors.dimText,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.md,
  },
  mono: {
    fontFamily: "Menlo",
  },
});
