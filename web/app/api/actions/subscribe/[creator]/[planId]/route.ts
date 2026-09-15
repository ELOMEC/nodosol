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
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { getAppUrl, USDC_UNIT } from "@/lib/constants";
import { fetchConfig } from "@/lib/config";
import { fetchPlan, formatPeriod } from "@/lib/plan";
import { subscriptionPda } from "@/lib/pdas";
import { getConnection, subscriptionProgram } from "@/lib/programs";
import { ata, getTokenProgramForMint } from "@/lib/token";

type RouteParams = {
  params: Promise<{ creator: string; planId: string }>;
};

// Default: pre-approve enough funds for 12 billing cycles so the
// subscriber does not have to return for re-approval every period.
const DEFAULT_PERIODS_PREAPPROVED = 12n;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { creator: creatorParam, planId: planIdParam } = await params;

  const creator = parsePubkey(creatorParam);
  const planId = parsePlanId(planIdParam);
  if (!creator || planId === null) {
    return errorJson("Invalid creator or plan id", 400);
  }

  const plan = await fetchPlan(creator, planId);
  if (!plan) {
    return errorJson(
      `No subscription plan ${planId} for ${creator.toBase58()}`,
      404
    );
  }

  const priceUsdc = Number(plan.pricePerPeriod) / USDC_UNIT;
  const periodLabel = formatPeriod(plan.periodSeconds);
  const href = `${getAppUrl()}/api/actions/subscribe/${creator.toBase58()}/${planId}`;

  const body: ActionGetResponse = {
    type: "action",
    icon: `${getAppUrl()}/icon.svg`,
    title: plan.active
      ? `Subscribe: $${priceUsdc}/${periodLabel}`
      : "Plan paused",
    description: plan.active
      ? `Creator ${shortAddr(creator)} — $${priceUsdc} USDC every ${periodLabel}. First ${
          DEFAULT_PERIODS_PREAPPROVED
        } cycles pre-approved; cancel anytime.`
      : "This subscription plan is not accepting new subscribers right now.",
    label: plan.active ? `Subscribe $${priceUsdc}` : "Unavailable",
    disabled: !plan.active,
    links: plan.active
      ? {
          actions: [
            {
              type: "transaction",
              label: `Subscribe`,
              href,
            },
          ],
        }
      : undefined,
  };

  return NextResponse.json(body, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { creator: creatorParam, planId: planIdParam } = await params;

  const creator = parsePubkey(creatorParam);
  const planId = parsePlanId(planIdParam);
  if (!creator || planId === null) {
    return errorJson("Invalid creator or plan id", 400);
  }

  const body = (await req.json()) as ActionPostRequest;
  const subscriber = parsePubkey(body.account ?? "");
  if (!subscriber) {
    return errorJson("Invalid subscriber account", 400);
  }

  const plan = await fetchPlan(creator, planId);
  if (!plan) {
    return errorJson(`Plan not found`, 404);
  }
  if (!plan.active) {
    return errorJson("Plan is paused", 409);
  }

  const connection = getConnection();
  const tokenProgram = await getTokenProgramForMint(connection, plan.mint);
  const subscriberAta = ata(subscriber, plan.mint, tokenProgram);

  const [subscriptionAddress] = subscriptionPda(plan.address, subscriber);
  const approveAmount =
    plan.pricePerPeriod * DEFAULT_PERIODS_PREAPPROVED;

  const program = subscriptionProgram();
  const config = await fetchConfig(program);
  const subscribeIx = await program.methods
    .subscribe(toBn(approveAmount))
    .accounts({
      subscriber,
      subscriberTokenAccount: subscriberAta,
      plan: plan.address,
      vault: plan.vault,
      subscription: subscriptionAddress,
      config: config.address,
      treasury: config.treasury,
      mint: plan.mint,
      tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: subscriber,
    recentBlockhash: blockhash,
  });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  tx.add(subscribeIx);

  const priceUsdc = Number(plan.pricePerPeriod) / USDC_UNIT;
  const response: ActionPostResponse = await createPostResponse({
    fields: {
      type: "transaction",
      transaction: tx,
      message: `Subscribed for $${priceUsdc} USDC every ${formatPeriod(
        plan.periodSeconds
      )}. First payment charged now.`,
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

function parsePlanId(raw: string): bigint | null {
  if (!raw) return null;
  try {
    const parsed = BigInt(raw);
    if (parsed < 0n) return null;
    return parsed;
  } catch {
    return null;
  }
}

function shortAddr(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function errorJson(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: ACTIONS_CORS_HEADERS });
}

function toBn(value: bigint) {
  const { BN } = require("@coral-xyz/anchor") as typeof import("@coral-xyz/anchor");
  return new BN(value.toString());
}
