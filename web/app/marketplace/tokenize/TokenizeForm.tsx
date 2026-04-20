"use client";

import { AnchorProvider, BN, Wallet } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { useEffect, useState } from "react";

import {
  AssetCategoryKey,
  assetClassLabels,
  assetPda,
  categoryFlag,
  categoryToAnchor,
  decodeIssuerStatus,
  issuerPda,
  IssuerAccount,
  IssuerStatusKey,
  jurisdictionsToString,
  mintProgram,
  registryProgram,
} from "@/lib/rwa";

type FormState = {
  name: string;
  symbol: string;
  category: AssetCategoryKey;
  quantity: string;
  deliveryRequired: boolean;
  shortDesc: string;
  longDesc: string;
  metadataUri: string;
};

const INITIAL: FormState = {
  name: "",
  symbol: "",
  category: "commodity",
  quantity: "",
  deliveryRequired: true,
  shortDesc: "",
  longDesc: "",
  metadataUri: "",
};

type SubmitState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "sending" }
  | { kind: "success"; signature: string; mint: string; assetPda: string }
  | { kind: "error"; message: string };

export function TokenizeForm() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [issuer, setIssuer] = useState<IssuerAccount | null | undefined>(undefined); // undefined = loading, null = not registered
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    if (!publicKey) {
      setIssuer(undefined);
      return;
    }
    const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
      commitment: "confirmed",
    });
    const program = registryProgram(provider);
    const [pda] = issuerPda(publicKey);
    (async () => {
      try {
        const accountApi = (program.account as Record<string, {
          fetchNullable: (addr: unknown) => Promise<unknown>;
        }>).issuer;
        const raw = (await accountApi.fetchNullable(pda)) as {
          owner: { toBase58(): string };
          status: Record<string, unknown>;
          jurisdictions: number[][];
          assetClasses: number;
          kycRef: string;
          registeredAt: { toNumber(): number };
          updatedAt: { toNumber(): number };
        } | null;
        if (!raw) {
          setIssuer(null);
          return;
        }
        setIssuer({
          address: pda,
          owner: publicKey,
          status: decodeIssuerStatus(raw.status),
          jurisdictions: raw.jurisdictions,
          assetClasses: raw.assetClasses,
          kycRef: raw.kycRef,
          registeredAt: raw.registeredAt.toNumber(),
          updatedAt: raw.updatedAt.toNumber(),
        });
      } catch (err) {
        console.error("issuer fetch failed", err);
        setIssuer(null);
      }
    })();
  }, [connection, publicKey, wallet]);

  const canSubmit = (() => {
    if (!connected || !publicKey) return false;
    if (!issuer || issuer.status !== "active") return false;
    if ((issuer.assetClasses & categoryFlag(form.category)) === 0) return false;
    if (!form.name.trim() || !form.symbol.trim()) return false;
    const qty = Number(form.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return false;
    return submit.kind === "idle" || submit.kind === "error" || submit.kind === "success";
  })();

  async function onSubmit() {
    if (!publicKey || !issuer || issuer.status !== "active") return;
    setSubmit({ kind: "signing" });
    try {
      const provider = new AnchorProvider(connection, wallet as unknown as Wallet, {
        commitment: "confirmed",
      });
      const program = mintProgram(provider);

      const mintKeypair = Keypair.generate();
      const assetId = BigInt(Math.floor(Date.now() / 1000));
      const [asset] = assetPda(publicKey, assetId);

      const mintLen = getMintLen([]);
      const mintRent = await connection.getMinimumBalanceForRentExemption(mintLen);

      const createMintIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports: mintRent,
        programId: TOKEN_2022_PROGRAM_ID,
      });
      const initMintIx = createInitializeMint2Instruction(
        mintKeypair.publicKey,
        0,
        publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      );
      const issuerAta = getAssociatedTokenAddressSync(
        mintKeypair.publicKey,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const createAtaIx = createAssociatedTokenAccountInstruction(
        publicKey,
        issuerAta,
        publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      );
      const tokenizeIx = await program.methods
        .tokenizeAsset(
          new BN(assetId.toString()),
          categoryToAnchor(form.category),
          new BN(form.quantity),
          form.deliveryRequired,
          form.name,
          form.symbol,
          form.metadataUri
        )
        .accounts({
          issuerOwner: publicKey,
          issuer: issuer.address,
          asset,
          mint: mintKeypair.publicKey,
          issuerTokenAccount: issuerAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
      tx.add(createMintIx);
      tx.add(initMintIx);
      tx.add(createAtaIx);
      tx.add(tokenizeIx);
      tx.partialSign(mintKeypair);

      setSubmit({ kind: "sending" });
      const signature = await wallet.sendTransaction(tx, connection, {
        signers: [mintKeypair],
      });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight }, "confirmed");

      setSubmit({
        kind: "success",
        signature,
        mint: mintKeypair.publicKey.toBase58(),
        assetPda: asset.toBase58(),
      });
      setForm(INITIAL);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Transaction failed";
      setSubmit({ kind: "error", message });
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "flex-start" }}>
      <div>
        <Stepper current={0} />

        {!connected ? (
          <Connect />
        ) : issuer === undefined ? (
          <LoadingBanner />
        ) : !issuer ? (
          <NotRegisteredBanner pubkey={publicKey!.toBase58()} />
        ) : issuer.status !== "active" ? (
          <IssuerInactiveBanner status={issuer.status} />
        ) : null}

        <Section title="General information" subtitle="Basic details shown in the marketplace card">
          <Field label="Product name">
            <input
              style={inputStyle}
              placeholder="Organic Wheat Package"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={64}
            />
          </Field>
          <Row>
            <Field label="Category">
              <select
                style={inputStyle}
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as AssetCategoryKey })
                }
              >
                <option value="commodity">Commodity</option>
                <option value="ticket">Ticket</option>
                <option value="realEstate">Real Estate</option>
                <option value="debt">Debt</option>
                <option value="equity">Equity</option>
                <option value="carbon">Carbon Credit</option>
                <option value="other">Other</option>
              </select>
              {issuer && (issuer.assetClasses & categoryFlag(form.category)) === 0 ? (
                <div style={hintError}>
                  Your issuer is not authorised for this class.
                </div>
              ) : null}
            </Field>
            <Field label="Symbol">
              <input
                style={inputStyle}
                placeholder="OWP"
                maxLength={16}
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Quantity (tokens)">
              <input
                style={inputStyle}
                placeholder="5"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </Field>
            <Field label="Physical delivery">
              <select
                style={inputStyle}
                value={form.deliveryRequired ? "yes" : "no"}
                onChange={(e) => setForm({ ...form, deliveryRequired: e.target.value === "yes" })}
              >
                <option value="yes">Yes — requires off-chain fulfilment</option>
                <option value="no">No — digital only</option>
              </select>
            </Field>
          </Row>
        </Section>

        <Section title="Description & media" subtitle="Rich content shown on the asset detail page">
          <Field label="Short description">
            <input
              style={inputStyle}
              placeholder="Sell high quality organic wheat from Serbia"
              value={form.shortDesc}
              onChange={(e) => setForm({ ...form, shortDesc: e.target.value })}
            />
          </Field>
          <Field label="Long description">
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Organic wheat cultivated without pesticides…"
              value={form.longDesc}
              onChange={(e) => setForm({ ...form, longDesc: e.target.value })}
            />
          </Field>
          <Field label="Metadata URI (IPFS / Arweave, optional)">
            <input
              style={inputStyle}
              placeholder="ipfs://Qm…"
              value={form.metadataUri}
              onChange={(e) => setForm({ ...form, metadataUri: e.target.value })}
              maxLength={256}
            />
          </Field>
        </Section>

        {submit.kind === "error" ? (
          <div style={errorBanner}>
            <strong>Transaction failed.</strong> {submit.message}
          </div>
        ) : null}

        {submit.kind === "success" ? (
          <SuccessBanner {...submit} />
        ) : null}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
          <button
            style={btnSecondary}
            onClick={() => setForm(INITIAL)}
            disabled={submit.kind === "signing" || submit.kind === "sending"}
          >
            Reset
          </button>
          <button
            style={{
              ...btnPrimary,
              opacity: canSubmit ? 1 : 0.55,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {submit.kind === "signing"
              ? "Waiting for wallet…"
              : submit.kind === "sending"
                ? "Sending…"
                : "Tokenize on Solana"}
          </button>
        </div>
      </div>

      <aside style={{ position: "sticky", top: 88 }}>
        <IssuerPanel issuer={issuer} connected={connected} />
        <div style={{ ...panel, marginTop: "1rem" }}>
          <div style={panelHeader}>Tokenisation summary</div>
          <div style={panelBody}>
            <InfoRow k="Token standard" v="Token-2022" />
            <InfoRow k="Supply model" v="Fixed (no further mints)" />
            <InfoRow k="Mint authority after" v="Revoked" />
            <InfoRow k="Burn authority" v="Issuer only" />
            <InfoRow k="Network" v="Solana devnet" />
          </div>
        </div>
        <div style={{ ...panel, marginTop: "1rem", background: "#eef2ff", borderColor: "#c7d2fe" }}>
          <div style={{ ...panelHeader, color: "#4338ca", background: "#eef2ff" }}>Compliance</div>
          <div style={{ ...panelBody, color: "#3730a3", fontSize: "0.82rem" }}>
            Tokenising on Nodosol requires an Active issuer record in <code style={codeInline}>rwa_registry</code> with the requested asset class authorised.
          </div>
        </div>
      </aside>
    </div>
  );
}

function Connect() {
  return (
    <div style={callToAction}>
      <div style={{ flex: 1 }}>
        <strong style={{ display: "block", marginBottom: "0.2rem" }}>Connect a wallet to continue</strong>
        <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>
          You need a wallet that is registered as an Active issuer in rwa_registry.
        </span>
      </div>
      <WalletMultiButton />
    </div>
  );
}

function LoadingBanner() {
  return (
    <div style={{ ...callToAction, color: "#6b7280" }}>Loading issuer status…</div>
  );
}

function NotRegisteredBanner({ pubkey }: { pubkey: string }) {
  return (
    <div style={{ ...callToAction, background: "#fef3c7", borderColor: "#fcd34d" }}>
      <div>
        <strong style={{ color: "#92400e" }}>Not registered as issuer</strong>
        <div style={{ color: "#78350f", fontSize: "0.85rem", marginTop: "0.2rem" }}>
          Wallet <code style={codeInline}>{shortenAddr(pubkey)}</code> has no Issuer record. Contact the
          registry administrator to get registered.
        </div>
      </div>
    </div>
  );
}

function IssuerInactiveBanner({ status }: { status: IssuerStatusKey }) {
  return (
    <div style={{ ...callToAction, background: "#fee2e2", borderColor: "#fca5a5" }}>
      <div>
        <strong style={{ color: "#991b1b" }}>Issuer status: {status}</strong>
        <div style={{ color: "#7f1d1d", fontSize: "0.85rem", marginTop: "0.2rem" }}>
          Only Active issuers can tokenise assets.
        </div>
      </div>
    </div>
  );
}

function SuccessBanner({ signature, mint, assetPda: asset }: { signature: string; mint: string; assetPda: string }) {
  const explorer = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  return (
    <div
      style={{
        background: "#ecfdf5",
        border: "1px solid #a7f3d0",
        borderRadius: 10,
        padding: "1rem 1.2rem",
        margin: "1rem 0",
      }}
    >
      <strong style={{ color: "#047857", display: "block", marginBottom: "0.4rem" }}>
        Asset tokenised
      </strong>
      <div style={{ fontSize: "0.82rem", color: "#065f46", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        <div>
          Mint: <code style={codeInline}>{shortenAddr(mint)}</code>
        </div>
        <div>
          Asset PDA: <code style={codeInline}>{shortenAddr(asset)}</code>
        </div>
        <a href={explorer(signature)} target="_blank" rel="noreferrer" style={{ color: "#047857", fontWeight: 600, marginTop: "0.3rem" }}>
          View on Solana Explorer →
        </a>
      </div>
    </div>
  );
}

function IssuerPanel({ issuer, connected }: { issuer: IssuerAccount | null | undefined; connected: boolean }) {
  return (
    <div style={panel}>
      <div style={panelHeader}>Issuer context</div>
      <div style={panelBody}>
        {!connected ? (
          <div style={{ color: "#6b7280", fontSize: "0.85rem", padding: "0.5rem 0" }}>
            Connect wallet to load your issuer record.
          </div>
        ) : issuer === undefined ? (
          <div style={{ color: "#6b7280", fontSize: "0.85rem", padding: "0.5rem 0" }}>Loading…</div>
        ) : !issuer ? (
          <div style={{ color: "#6b7280", fontSize: "0.85rem", padding: "0.5rem 0" }}>
            Not registered.
          </div>
        ) : (
          <>
            <InfoRow k="Wallet" v={shortenAddr(issuer.owner.toBase58())} />
            <InfoRow k="Status" v={<StatusPill status={issuer.status} />} />
            <InfoRow k="Jurisdictions" v={jurisdictionsToString(issuer.jurisdictions).join(", ") || "—"} />
            <InfoRow k="Authorised classes" v={assetClassLabels(issuer.assetClasses).join(" · ") || "—"} />
            <InfoRow k="KYC ref" v={issuer.kycRef} />
          </>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["General info", "Description", "Review", "Tokenize"];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "1.25rem",
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 10,
        padding: "0.7rem 0.9rem",
      }}
    >
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  background: done ? "#10b981" : active ? "#4f46e5" : "#e5e7eb",
                  color: done || active ? "#fff" : "#6b7280",
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span style={{ fontSize: "0.84rem", color: active ? "#111827" : "#6b7280", fontWeight: active ? 600 : 500 }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div style={{ flex: 1, height: 1, background: done ? "#10b981" : "#e5e7eb" }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #eef0f3",
        borderRadius: 12,
        padding: "1.3rem 1.4rem",
        marginBottom: "1rem",
      }}
    >
      <div style={{ marginBottom: "1.1rem" }}>
        <h3 style={{ fontSize: "0.98rem", fontWeight: 600, marginBottom: "0.2rem" }}>{title}</h3>
        <p style={{ fontSize: "0.82rem", color: "#6b7280" }}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.95rem" }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "0.78rem", color: "#374151", fontWeight: 500, marginBottom: "0.35rem" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.95rem" }}>{children}</div>;
}

function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{k}</span>
      <span style={{ fontSize: "0.82rem", color: "#111827", fontWeight: 500 }}>{v}</span>
    </div>
  );
}

function StatusPill({ status }: { status: IssuerStatusKey }) {
  const map = {
    active: { bg: "rgba(16,185,129,0.12)", fg: "#059669", dot: "#10b981", label: "Active" },
    pending: { bg: "rgba(234,179,8,0.12)", fg: "#854d0e", dot: "#eab308", label: "Pending" },
    suspended: { bg: "rgba(245,158,11,0.12)", fg: "#b45309", dot: "#f59e0b", label: "Suspended" },
    revoked: { bg: "rgba(107,114,128,0.12)", fg: "#4b5563", dot: "#6b7280", label: "Revoked" },
  };
  const c = map[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        background: c.bg,
        color: c.fg,
        padding: "0.2rem 0.55rem",
        borderRadius: 4,
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function shortenAddr(s: string): string {
  return s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  color: "#111827",
  padding: "0.62rem 0.8rem",
  fontSize: "0.88rem",
  outline: "none",
  fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  padding: "0.65rem 1.4rem",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 600,
  boxShadow: "0 1px 2px rgba(79,70,229,0.25)",
};

const btnSecondary: React.CSSProperties = {
  background: "#ffffff",
  color: "#374151",
  border: "1px solid #e5e7eb",
  padding: "0.65rem 1.25rem",
  borderRadius: 8,
  fontSize: "0.88rem",
  fontWeight: 600,
  cursor: "pointer",
};

const callToAction: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #eef0f3",
  borderRadius: 10,
  padding: "0.95rem 1.15rem",
  marginBottom: "1rem",
  display: "flex",
  alignItems: "center",
  gap: "1rem",
};

const errorBanner: React.CSSProperties = {
  background: "#fee2e2",
  border: "1px solid #fca5a5",
  borderRadius: 10,
  color: "#991b1b",
  padding: "0.95rem 1.15rem",
  margin: "1rem 0",
  fontSize: "0.88rem",
};

const hintError: React.CSSProperties = {
  color: "#b91c1c",
  fontSize: "0.75rem",
  marginTop: "0.3rem",
};

const codeInline: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#4338ca",
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.78rem",
  fontFamily: "'SF Mono', Menlo, monospace",
};

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #eef0f3",
  borderRadius: 12,
  overflow: "hidden",
};

const panelHeader: React.CSSProperties = {
  padding: "0.85rem 1rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "#111827",
  borderBottom: "1px solid #eef0f3",
  background: "#fafbfc",
};

const panelBody: React.CSSProperties = {
  padding: "0.4rem 1rem 0.85rem",
};
