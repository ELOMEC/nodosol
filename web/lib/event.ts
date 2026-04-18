import { PublicKey } from "@solana/web3.js";

import { eventPda } from "./pdas";
import { eventsProgram } from "./programs";

export type EventRecord = {
  address: PublicKey;
  creator: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
  eventId: bigint;
  price: bigint;
  capacity: bigint;
  soldCount: bigint;
  checkedInCount: bigint;
  startsAt: bigint;
  endsAt: bigint;
  active: boolean;
  metadataUri: string;
  totalRevenue: bigint;
  totalWithdrawn: bigint;
};

export async function fetchEvent(
  creator: PublicKey,
  eventId: bigint
): Promise<EventRecord | null> {
  const [address] = eventPda(creator, eventId);
  const program = eventsProgram();
  try {
    const record = await (
      program.account as unknown as {
        event: {
          fetchNullable: (addr: PublicKey) => Promise<{
            creator: PublicKey;
            mint: PublicKey;
            vault: PublicKey;
            eventId: { toString: () => string };
            price: { toString: () => string };
            capacity: { toString: () => string };
            soldCount: { toString: () => string };
            checkedInCount: { toString: () => string };
            startsAt: { toString: () => string };
            endsAt: { toString: () => string };
            active: boolean;
            metadataUri: string;
            totalRevenue: { toString: () => string };
            totalWithdrawn: { toString: () => string };
          } | null>;
        };
      }
    ).event.fetchNullable(address);
    if (!record) return null;
    return {
      address,
      creator: record.creator,
      mint: record.mint,
      vault: record.vault,
      eventId: BigInt(record.eventId.toString()),
      price: BigInt(record.price.toString()),
      capacity: BigInt(record.capacity.toString()),
      soldCount: BigInt(record.soldCount.toString()),
      checkedInCount: BigInt(record.checkedInCount.toString()),
      startsAt: BigInt(record.startsAt.toString()),
      endsAt: BigInt(record.endsAt.toString()),
      active: record.active,
      metadataUri: record.metadataUri,
      totalRevenue: BigInt(record.totalRevenue.toString()),
      totalWithdrawn: BigInt(record.totalWithdrawn.toString()),
    };
  } catch (err) {
    console.error("fetchEvent failed", err);
    return null;
  }
}
