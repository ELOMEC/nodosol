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
import { fetchEvent } from "@/lib/event";
import { ticketPda } from "@/lib/pdas";
import { eventsProgram, getConnection } from "@/lib/programs";
import { ata, getTokenProgramForMint } from "@/lib/token";

type RouteParams = {
  params: Promise<{ creator: string; eventId: string }>;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: ACTIONS_CORS_HEADERS });
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { creator: creatorParam, eventId: eventIdParam } = await params;

  const creator = parsePubkey(creatorParam);
  const eventId = parseEventId(eventIdParam);
  if (!creator || eventId === null) {
    return errorJson("Invalid creator or event id", 400);
  }

  const event = await fetchEvent(creator, eventId);
  if (!event) {
    return errorJson(
      `No event ${eventId} for ${creator.toBase58()}`,
      404
    );
  }

  const priceUsdc = Number(event.price) / USDC_UNIT;
  const soldOut =
    event.capacity > 0n && event.soldCount >= event.capacity;
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const notOpen = nowSec < event.startsAt;
  const ended = nowSec >= event.endsAt;
  const unavailable = !event.active || soldOut || ended;

  const title = unavailable
    ? soldOut
      ? "Sold out"
      : ended
        ? "Event ended"
        : "Event paused"
    : priceUsdc === 0
      ? "Free ticket"
      : `Buy ticket — $${priceUsdc}`;

  const description = [
    `Event ${event.eventId} by ${shortAddr(creator)}.`,
    event.capacity > 0n
      ? `${event.soldCount}/${event.capacity} tickets sold.`
      : `${event.soldCount} tickets sold.`,
    notOpen ? "Sale opens at scheduled start time." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const href = `${getAppUrl()}/api/actions/ticket/${creator.toBase58()}/${eventId}`;

  const body: ActionGetResponse = {
    type: "action",
    icon: `${getAppUrl()}/icon.svg`,
    title,
    description,
    label: unavailable
      ? "Unavailable"
      : priceUsdc === 0
        ? "Claim"
        : `Buy $${priceUsdc}`,
    disabled: unavailable || notOpen,
    links: unavailable
      ? undefined
      : {
          actions: [
            {
              type: "transaction",
              label: priceUsdc === 0 ? "Claim ticket" : `Buy $${priceUsdc}`,
              href,
            },
          ],
        },
  };

  return NextResponse.json(body, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { creator: creatorParam, eventId: eventIdParam } = await params;

  const creator = parsePubkey(creatorParam);
  const eventId = parseEventId(eventIdParam);
  if (!creator || eventId === null) {
    return errorJson("Invalid creator or event id", 400);
  }

  const body = (await req.json()) as ActionPostRequest;
  const attendee = parsePubkey(body.account ?? "");
  if (!attendee) {
    return errorJson("Invalid attendee account", 400);
  }

  const event = await fetchEvent(creator, eventId);
  if (!event) return errorJson("Event not found", 404);
  if (!event.active) return errorJson("Event is not active", 409);
  if (event.capacity > 0n && event.soldCount >= event.capacity) {
    return errorJson("Event is sold out", 409);
  }

  const connection = getConnection();
  const tokenProgram = await getTokenProgramForMint(connection, event.mint);
  const attendeeAta = ata(attendee, event.mint, tokenProgram);

  const [ticketAddress] = ticketPda(event.address, attendee);

  const program = eventsProgram();
  const buyIx = await program.methods
    .buyTicket()
    .accounts({
      attendee,
      attendeeTokenAccount: attendeeAta,
      event: event.address,
      vault: event.vault,
      ticket: ticketAddress,
      mint: event.mint,
      tokenProgram,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: attendee,
    recentBlockhash: blockhash,
  });
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }));
  tx.add(buyIx);

  const priceUsdc = Number(event.price) / USDC_UNIT;
  const response: ActionPostResponse = await createPostResponse({
    fields: {
      type: "transaction",
      transaction: tx,
      message:
        priceUsdc === 0
          ? `Ticket claimed for event ${eventId}.`
          : `Ticket purchased for $${priceUsdc} USDC — event ${eventId}.`,
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

function parseEventId(raw: string): bigint | null {
  if (!raw) return null;
  try {
    const n = BigInt(raw);
    if (n < 0n) return null;
    return n;
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
