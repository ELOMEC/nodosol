/**
 * Thin wrapper over Helius DAS (Digital Asset Standard) API for querying
 * compressed NFT assets by owner. Set NEXT_PUBLIC_HELIUS_API_KEY in the
 * environment to enable — without it, the client points at the public
 * devnet-helius-rpc endpoint (rate-limited but works for small demos).
 */

export type HeliusAsset = {
  id: string;
  interface: string;
  compression?: {
    compressed: boolean;
    tree?: string;
    leaf_id?: number;
  };
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
    };
    links?: {
      image?: string;
    };
    json_uri?: string;
  };
  ownership?: {
    owner?: string;
    delegate?: string | null;
  };
  creators?: Array<{ address: string; verified: boolean; share: number }>;
};

type GetAssetsByOwnerResponse = {
  jsonrpc: string;
  id: string;
  result: {
    total: number;
    limit: number;
    page: number;
    items: HeliusAsset[];
  };
};

export function getHeliusEndpoint(): string {
  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (apiKey) {
    return `https://devnet.helius-rpc.com/?api-key=${apiKey}`;
  }
  // Public DAS endpoint (no key, rate-limited). Falls back to the stock RPC
  // which doesn't expose `getAssetsByOwner` — callers should handle the
  // resulting error by showing an onboarding hint.
  return "https://devnet.helius-rpc.com/";
}

export async function getAssetsByOwner(owner: string): Promise<HeliusAsset[]> {
  const resp = await fetch(getHeliusEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nodosol-assets-by-owner",
      method: "getAssetsByOwner",
      params: {
        ownerAddress: owner,
        page: 1,
        limit: 1000,
        displayOptions: { showCollectionMetadata: true },
      },
    }),
  });
  if (!resp.ok) {
    throw new Error(`Helius DAS returned ${resp.status}`);
  }
  const payload = (await resp.json()) as GetAssetsByOwnerResponse | { error: { message: string } };
  if ("error" in payload) {
    throw new Error(payload.error.message ?? "Helius error");
  }
  return payload.result.items;
}

/** Heuristic: a cNFT ticket has compressed=true and its creator list contains
 *  the event PDA, OR its tree is one of the trees we tracked. For now we just
 *  return all compressed assets — the caller can filter further by tree list.
 */
export function filterCompressed(assets: HeliusAsset[]): HeliusAsset[] {
  return assets.filter((a) => a.compression?.compressed === true);
}

/** Fetch a single asset by its Helius ID (cNFT asset id). */
export async function getAsset(assetId: string): Promise<HeliusAsset | null> {
  const resp = await fetch(getHeliusEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nodosol-get-asset",
      method: "getAsset",
      params: { id: assetId },
    }),
  });
  if (!resp.ok) throw new Error(`Helius DAS returned ${resp.status}`);
  const payload = (await resp.json()) as
    | { result: HeliusAsset | null }
    | { error: { message: string } };
  if ("error" in payload) throw new Error(payload.error.message ?? "Helius error");
  return payload.result ?? null;
}
