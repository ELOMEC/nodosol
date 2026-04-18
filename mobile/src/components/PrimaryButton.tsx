import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.secondary,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <View style={styles.row}>
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
});
