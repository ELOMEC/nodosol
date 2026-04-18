import { NextResponse } from "next/server";

/**
 * Registers which paths on this origin expose Solana Actions so
 * clients (dial.to, wallets) can discover them from the root URL.
 * https://solana.com/docs/advanced/actions#actions.json
 */
export function GET() {
  return NextResponse.json({
    rules: [
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      { pathPattern: "/c/*/tip", apiPath: "/api/actions/tip/*" },
    ],
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
