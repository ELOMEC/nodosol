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

/**
 * Full result of Helius `getAssetProof` — used to CPI into Bubblegum
 * `transfer`. `proof` contains base58-encoded Merkle sibling pubkeys in
 * leaf → root order; caller appends them as remaining_accounts.
 */
export type HeliusAssetProof = {
  root: string;
  proof: string[];
  node_index: number;
  leaf: string;
  tree_id: string;
};

export async function getAssetProof(assetId: string): Promise<HeliusAssetProof> {
  const resp = await fetch(getHeliusEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nodosol-get-asset-proof",
      method: "getAssetProof",
      params: { id: assetId },
    }),
  });
  if (!resp.ok) throw new Error(`Helius DAS returned ${resp.status}`);
  const payload = (await resp.json()) as
    | { result: HeliusAssetProof }
    | { error: { message: string } };
  if ("error" in payload) throw new Error(payload.error.message ?? "Helius error");
  return payload.result;
}

/**
 * The `data_hash` / `creator_hash` returned by getAsset are under
 * `compression.data_hash` and `compression.creator_hash`, plus the leaf
 * `compression.leaf_id` / `compression.nonce`. Bubblegum transfer takes
 * all four plus the root from getAssetProof.
 */
export type HeliusCompressionDetails = {
  dataHashBase58: string;
  creatorHashBase58: string;
  leafId: number;
  // Nonce on the leaf — for v1 cNFTs equals leaf_id, but stored on the
  // asset separately in case a future version diverges.
  nonce: bigint;
};

export async function getAssetCompressionDetails(
  assetId: string
): Promise<HeliusCompressionDetails | null> {
  const resp = await fetch(getHeliusEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nodosol-get-asset-compression",
      method: "getAsset",
      params: { id: assetId },
    }),
  });
  if (!resp.ok) throw new Error(`Helius DAS returned ${resp.status}`);
  const payload = (await resp.json()) as
    | {
        result: {
          compression?: {
            data_hash?: string;
            creator_hash?: string;
            leaf_id?: number;
            seq?: number;
            tree?: string;
            asset_hash?: string;
          } | null;
        } | null;
      }
    | { error: { message: string } };
  if ("error" in payload) throw new Error(payload.error.message ?? "Helius error");
  const compression = payload.result?.compression;
  if (!compression || compression.data_hash === undefined || compression.creator_hash === undefined) {
    return null;
  }
  return {
    dataHashBase58: compression.data_hash,
    creatorHashBase58: compression.creator_hash,
    leafId: compression.leaf_id ?? 0,
    nonce: BigInt(compression.leaf_id ?? 0),
  };
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
