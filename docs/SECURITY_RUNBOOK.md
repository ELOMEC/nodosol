# Security runbook — Nodosol

Operational checklist for things the code can't do by itself — wallet
operations, dashboard clicks, credential rotations. Commands assume you
run them from the repo root.

Two tasks in this first pass:

1. **Rotate `CHAT_JWT_SECRET`** — replaces the HS256 secret that signs
   chat JWTs. Fast (≈5 min) and zero blast radius.
2. **Move program upgrade authority to a Squads multisig** — the big
   one. Eliminates the single-keypair hijack risk (≈30 min).

Do them in that order: rotating the JWT secret first is harmless if
anything else in this runbook goes sideways.

---

## 1. Rotate `CHAT_JWT_SECRET`

### Why

Every chat read JWT is HS256-signed with a secret shared between the
`issue-chat-jwt` Edge Function and Supabase RLS. If that secret leaks,
an attacker can forge a JWT for any wallet and read any thread they
have the 64-char memo_hash for. Rotation purges that risk.

### Prereqs

- Supabase CLI logged in (`supabase login` with a personal access token)
- Write access to the `xvgxaodxylrolkpyuszx` Supabase project

### Steps

**1. Generate a new secret**

```bash
openssl rand -base64 48
```

Copy the output. This is the new value for both Supabase's Legacy JWT
Secret and the Edge Function secret.

**2. Update Supabase's Legacy JWT Secret**

Browser:

1. <https://supabase.com/dashboard/project/xvgxaodxylrolkpyuszx/settings/api>
2. Scroll to "JWT Settings" → **Legacy JWT Secret** → Rotate
3. Paste the new secret from step 1. Save.

Note: this immediately invalidates every live user's JWT (they sign a
new wallet challenge on next read — costs one popup each).

**3. Update the Edge Function secret**

```bash
supabase secrets set CHAT_JWT_SECRET="<paste-new-secret>" \
  --project-ref xvgxaodxylrolkpyuszx
```

**4. Redeploy the function**

```bash
supabase functions deploy issue-chat-jwt \
  --project-ref xvgxaodxylrolkpyuszx \
  --no-verify-jwt
```

**5. Smoke test**

Open <https://nodosol.com/chat> in a private window, connect a wallet,
pick a channel, sign the auth challenge, post a test message. If
messages render and posting works, rotation is clean.

If the panel says "JWT issuance failed" or messages 401, re-check that
the secrets in steps 2 and 3 are byte-identical (no trailing whitespace).

### Done when

- Secrets match on both sides
- Function redeployed
- Smoke test posts a message

---

## 2. Move program upgrade authority to Squads multisig

### Why

Currently all 9 programs' upgrade authority is
`3E8ZZJBkz82RmLSSmMZJBGuwrtkJDoCsX5UZVj26rqBr` — a single dev keypair.
Compromise of that key = attacker redeploys every program with malicious
code. A 2-of-3 multisig means two independent signers must approve any
upgrade.

### Prereqs

- Three Solana wallets on the target cluster (devnet for now, mainnet
  later). Recommended:
  1. Your existing dev wallet
  2. A hardware wallet you own (Ledger)
  3. An independent co-signer you trust (co-founder, advisor)
- Solana CLI on your path (`solana --version`)
- Dev keypair at `~/.config/solana/id-devnet.json` (same one used for deploys)

### Step 1 — Create the multisig

1. Visit <https://v4.squads.so> and toggle network to **Devnet**
2. Connect the dev wallet
3. **Create New Multisig**
   - Threshold: **2 of 3**
   - Members: paste the three pubkeys from above
   - Name: `Nodosol Programs` (or similar)
4. Pay the one-time ≈0.01 SOL creation fee
5. Copy the multisig's **Vault address** — that's the new upgrade
   authority

### Step 2 — Transfer upgrade authority

There's a helper script that loops through all 9 programs:

```bash
./scripts/transfer-upgrade-authority.sh <SQUADS_VAULT_ADDRESS>
```

Script prompts for confirmation before each program and prints the tx
signature. Each call uses your existing dev keypair to sign.

If you prefer to do it one program at a time, the manual command is:

```bash
solana program set-upgrade-authority \
  <PROGRAM_ID> \
  --new-upgrade-authority <SQUADS_VAULT> \
  --skip-new-upgrade-authority-signer-check \
  --url devnet \
  --keypair ~/.config/solana/id-devnet.json
```

(The `--skip-new-upgrade-authority-signer-check` flag is required
because a Squads vault can't sign the tx inline — Squads validates
authority internally once it receives the transfer.)

### Step 3 — Verify

```bash
# For each program, confirm new authority:
for pid in \
  C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P \
  8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w \
  4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax \
  FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE \
  7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT \
  HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU \
  69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ \
  FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz \
  6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v; do
  echo "--- $pid"
  solana program show "$pid" --url devnet | grep Authority
done
```

Expected: every program prints `Authority: <SQUADS_VAULT>`. If any
still shows the old dev wallet, re-run the transfer for that program.

### Step 4 — Test an upgrade through Squads

Before trusting the setup, rehearse one upgrade end-to-end:

1. Pick the smallest program (e.g. `rwa_registry`)
2. Build locally: `anchor build`
3. In the Squads UI: **Programs → rwa_registry → Upgrade**
4. Upload `target/deploy/rwa_registry.so`
5. Squads creates a tx proposal. **Signer A approves**, then **signer
   B approves**. Threshold reached → tx executes.
6. Run `solana program show <rwa_registry_id> --url devnet` and confirm
   the data hash changed (new deploy)

If this works, the setup is real. If it fails, fix before trusting any
upgrade path.

### Done when

- All 9 programs list the Squads vault as upgrade authority
- One rehearsal upgrade lands via multisig signatures

### Mainnet note

When you go to mainnet you create a **separate** Squads multisig with
**different signers** — ideally all hardware wallets. Do not reuse the
devnet signers. Repeat steps 1-4 pointing at mainnet cluster.

---

## After both tasks

- Commit any code changes (none from this runbook — this is pure ops)
- Note completion date in `project_solana_superapp.md` memory entry so
  next session knows it was done
- Consider reaching out to audit firms (OtterSec / Neodyme / Zellic) —
  4-8 week wait list, so outreach now pays off later

## Emergency pause reference

With the `update_pause` admin instruction we added, the Squads vault
can now halt fund-moving instructions program-by-program without a
full redeploy. In an incident:

1. Someone in Squads proposes `update_pause(paused: true)` against the
   suspect program
2. Two signers approve → paused within seconds
3. Investigate, prepare fix, run rehearsed upgrade flow
4. Propose `update_pause(paused: false)` when the fix is live

A client helper for this proposal (TS builder for the `update_pause`
instruction) is still a TODO — file a separate task when you want it.
