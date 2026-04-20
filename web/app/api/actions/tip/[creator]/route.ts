import {
  ACTIONS_CORS_HEADERS,
  type ActionGetResponse,
  type ActionPostRequest,
  type ActionPostResponse,
  createPostResponse,
} from "@solana/actions";
import {
  ComputeBudgetProgram,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { getAppUrl, USDC_UNIT } from "@/lib/constants";
import { fetchConfig } from "@/lib/config";
import { fetchCreatorProfile } from "@/lib/creator";
import { creatorProfilePda } from "@/lib/pdas";
import { getConnection, tipJarProgram } from "@/lib/programs";
import { ata, getTokenProgramForMint } from "@/lib/token";

type RouteParams = { params: Promise<{ creator: string }> };

const PRESET_AMOUNTS = [1, 5, 10, 25];

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { creator: creatorParam } = await params;
  const { searchParams } = new URL(req.url);
  const requestedAmount = searchParams.get("amount");

  const creator = parsePubkey(creatorParam);
  if (!creator) {
    return errorJson("Invalid creator address", 400);
  }

  const profile = await fetchCreatorProfile(creator);
  if (!profile) {
    const [pda] = creatorProfilePda(creator);
    return errorJson(
      `No creator profile found for ${creator.toBase58()} (expected PDA ${pda.toBase58()})`,
      404
    );
  }

  const shortWallet = `${creator.toBase58().slice(0, 4)}…${creator.toBase58().slice(-4)}`;
  const href = `${getAppUrl()}/api/actions/tip/${creator.toBase58()}`;

  const body: ActionGetResponse = {
    type: "action",
    icon: `${getAppUrl()}/icon.svg`,
    title: `Tip creator ${shortWallet}`,
    description: [
      `Send USDC directly to ${shortWallet}'s on-chain vault.`,
      `Settles instantly. Powered by nodosol.`,
    ].join(" "),
    label: requestedAmount ? `Tip $${requestedAmount}` : "Tip",
    links: {
      actions: [
        ...PRESET_AMOUNTS.map((amount) => ({
          type: "transaction" as const,
          label: `$${amount}`,
          href: `${href}?amount=${amount}`,
        })),
        {
          type: "transaction" as const,
          label: "Custom",
          href: `${href}?amount={amount}`,
          parameters: [
            {
              name: "amount",
              label: "USDC amount",
              required: true,
              type: "number" as const,
            },
          ],
        },
      ],
    },
  };

  return NextResponse.json(body, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { creator: creatorParam } = await params;
  const { searchParams } = new URL(req.url);

  const creator = parsePubkey(creatorParam);
  if (!creator) {
    return errorJson("Invalid creator address", 400);
  }

  const body = (await req.json()) as ActionPostRequest;
  const tipper = parsePubkey(body.account ?? "");
  if (!tipper) {
    return errorJson("Invalid tipper account", 400);
  }

  const amountParam = searchParams.get("amount");
  const amount = parseAmount(amountParam);
  if (!amount) {
    return errorJson("Missing or invalid amount", 400);
  }

  const profile = await fetchCreatorProfile(creator);
  if (!profile) {
    return errorJson(`No creator profile for ${creator.toBase58()}`, 404);
  }

  const connection = getConnection();
  const tokenProgram = await getTokenProgramForMint(connection, profile.mint);
  const tipperAta = ata(tipper, profile.mint, tokenProgram);

  const program = tipJarProgram();
  const config = await fetchConfig(program);
  const sendTipIx: TransactionInstruction = await program.methods
    .sendTip(toBn(amount))
    .accounts({
      tipper,
      tipperTokenAccount: tipperAta,
      creatorProfile: profile.address,
      vault: profile.vault,
      config: config.address,
      treasury: config.treasury,
      mint: profile.mint,
      tokenProgram,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: tipper, recentBlockhash: blockhash });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  tx.add(sendTipIx);

  const response: ActionPostResponse = await createPostResponse({
    fields: {
      type: "transaction",
      transaction: tx,
      message: `Tipping $${amountParam} USDC to ${creator.toBase58().slice(0, 4)}…${creator
        .toBase58()
        .slice(-4)}`,
    },
  });

  return NextResponse.json(response, { headers: ACTIONS_CORS_HEADERS });
}

function parsePubkey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function parseAmount(raw: string | null): bigint | null {
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return null;
  const baseUnits = Math.round(num * USDC_UNIT);
  if (baseUnits <= 0) return null;
  return BigInt(baseUnits);
}

function errorJson(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: ACTIONS_CORS_HEADERS });
}

// Anchor's Program.methods expects a BN-like value for u64 args. We
// construct it via the web3.js BN re-export to keep deps tight.
function toBn(value: bigint) {
  const { BN } = require("@coral-xyz/anchor") as typeof import("@coral-xyz/anchor");
  return new BN(value.toString());
}
