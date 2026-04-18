import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  title?: string;
  children: ReactNode;
};

export function Card({ title, children }: Props) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.mutedText,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  body: {
    gap: spacing.sm,
  },
});
