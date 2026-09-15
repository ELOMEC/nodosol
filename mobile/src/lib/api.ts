import Constants from "expo-constants";

type ActionLink =
  | {
      type?: "transaction";
      label: string;
      href: string;
      parameters?: Array<{ name: string; label?: string; required?: boolean; type?: string }>;
    };

export type ActionMetadata = {
  type?: string;
  icon?: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  links?: { actions: ActionLink[] };
};

export type BuildTxResponse = {
  type?: "transaction";
  transaction: string; // base64 serialized tx
  message?: string;
};

export function apiBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl;
  return fromExtra ?? "http://localhost:3000";
}

function actionUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(path, apiBaseUrl());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function getActionMetadata(
  path: string,
  query?: Record<string, string | number | undefined>
): Promise<ActionMetadata> {
  const res = await fetch(actionUrl(path, query), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await safeJson(res);
    const msg = body?.message ?? `GET ${path} failed: ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as ActionMetadata;
}

export async function buildTransaction(
  path: string,
  account: string,
  query?: Record<string, string | number | undefined>
): Promise<BuildTxResponse> {
  const res = await fetch(actionUrl(path, query), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ account }),
  });
  if (!res.ok) {
    const body = await safeJson(res);
    const msg = body?.message ?? `POST ${path} failed: ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as BuildTxResponse;
}

async function safeJson(res: Response): Promise<{ message?: string } | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function tipPath(creator: string) {
  return `/api/actions/tip/${creator}`;
}

export function subscribePath(creator: string, planId: number | string) {
  return `/api/actions/subscribe/${creator}/${planId}`;
}

export function ticketPath(creator: string, eventId: number | string) {
  return `/api/actions/ticket/${creator}/${eventId}`;
}
