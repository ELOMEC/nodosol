import { describe, it, expect, afterEach } from "vitest";
import { getAppUrl, getRpcUrl } from "./constants";

describe("constants", () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in snapshot)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("getRpcUrl falls back to public devnet RPC", () => {
    delete process.env.SOLANA_RPC_URL;
    expect(getRpcUrl()).toBe("https://api.devnet.solana.com");
  });

  it("getAppUrl falls back to local dev URL", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});
