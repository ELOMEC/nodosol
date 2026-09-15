import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import {
  ActionMetadata,
  apiBaseUrl,
  getActionMetadata,
} from "@/lib/api";
import { openActionInWallet } from "@/lib/wallet";
import { colors, spacing } from "@/lib/theme";

type Props = {
  path: string;
  query?: Record<string, string | number | undefined>;
  heading: string;
};

/**
 * Generic Action renderer — fetches the metadata from a Blink
 * endpoint, shows the title/description and the action links, and
 * hands each link off to the installed wallet when tapped.
 */
export function ActionScreen({ path, query, heading }: Props) {
  const [meta, setMeta] = useState<ActionMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActionMetadata(path, query)
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path, JSON.stringify(query ?? {})]);

  return (
    <Screen>
      <Text style={styles.heading}>{heading}</Text>

      {error ? (
        <Card title="Error">
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.hint}>Checked: {apiBaseUrl()}{path}</Text>
        </Card>
      ) : !meta ? (
        <Card title="Loading">
          <Text style={styles.muted}>Fetching action metadata…</Text>
        </Card>
      ) : (
        <>
          <Card title={meta.label}>
            <Text style={styles.title}>{meta.title}</Text>
            <Text style={styles.body}>{meta.description}</Text>
          </Card>

          {meta.disabled ? (
            <Card title="Unavailable">
              <Text style={styles.muted}>
                This action is currently disabled by the creator.
              </Text>
            </Card>
          ) : (
            <Card title="Actions">
              {(meta.links?.actions ?? []).map((link, idx) => {
                const hasParams =
                  Array.isArray(link.parameters) && link.parameters.length > 0;
                return (
                  <PrimaryButton
                    key={`${link.label}-${idx}`}
                    label={hasParams ? `${link.label} (choose amount)` : link.label}
                    onPress={() => handleLink(link.href, hasParams)}
                    variant={idx === 0 ? "primary" : "secondary"}
                  />
                );
              })}
            </Card>
          )}

          <View>
            <Text style={styles.muted}>
              Tapping an action hands off to your wallet for signing. The
              endpoint at <Text style={styles.mono}>{apiBaseUrl()}</Text> builds
              the transaction; your wallet signs and submits it.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

async function handleLink(href: string, hasParams: boolean) {
  if (hasParams) {
    Alert.alert(
      "Custom amount",
      "Parameter-based actions need a wallet that can render the input. " +
        "Opening in your wallet (Phantom / dial.to).",
      [
        {
          text: "Open",
          onPress: () => void openActionInWallet(href),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
    return;
  }
  await openActionInWallet(href);
}

const styles = StyleSheet.create({
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  body: {
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  muted: {
    color: colors.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },
  hint: {
    color: colors.dimText,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  mono: {
    fontFamily: "Menlo",
  },
});
