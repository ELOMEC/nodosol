#!/usr/bin/env bash
#
# Transfer the upgrade authority of all 9 Nodosol programs to a target
# address (typically a Squads multisig vault). Prompts for confirmation
# before each program. Safe to re-run — programs whose authority already
# matches the target are skipped.
#
# Usage:
#   ./scripts/transfer-upgrade-authority.sh <NEW_AUTHORITY> [cluster]
#
#   NEW_AUTHORITY   Squads vault pubkey (base58)
#   cluster         devnet (default) | mainnet-beta
#

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <NEW_AUTHORITY_PUBKEY> [cluster]" >&2
  echo "  cluster defaults to devnet" >&2
  exit 1
fi

NEW_AUTHORITY="$1"
CLUSTER="${2:-devnet}"

# Pick a keypair per cluster. Adjust if your layout differs.
case "$CLUSTER" in
  devnet)
    KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/id-devnet.json}"
    URL_FLAG="--url devnet"
    ;;
  mainnet-beta|mainnet)
    KEYPAIR="${SOLANA_KEYPAIR:-$HOME/.config/solana/id-mainnet.json}"
    URL_FLAG="--url mainnet-beta"
    ;;
  *)
    echo "Unknown cluster: $CLUSTER" >&2
    exit 1
    ;;
esac

if [[ ! -f "$KEYPAIR" ]]; then
  echo "Keypair not found at $KEYPAIR" >&2
  echo "Override with SOLANA_KEYPAIR=/path/to/keypair.json" >&2
  exit 1
fi

# Rudimentary base58 length check — full validation is below via `solana program show`.
if [[ ${#NEW_AUTHORITY} -lt 32 || ${#NEW_AUTHORITY} -gt 44 ]]; then
  echo "NEW_AUTHORITY doesn't look like a base58 pubkey: $NEW_AUTHORITY" >&2
  exit 1
fi

PROGRAMS=(
  "tip_jar:C2bM3p1Cco4bDj6gQe29k7UWcepxLCrVgiPPoidh549P"
  "subscription:8G2hbD1qJUcaVAEdfVxaHfbCgxyEzQdrpjhDMM9pSL4w"
  "events:4q4KxCcvY7vswq3tXgr448ghXWBtz4PzNfoddZu282Ax"
  "event_tickets:FDUwvXRETURbe2JN2PJNCKt6RPAsSLeSi7A4pFMGmtrE"
  "rwa_registry:7BCWTrD7rcedAg3zpvtvNdManv39kzr3eHBjWyomCbdT"
  "rwa_mint:HLCCfvp99Z1Rnix64mC6w6dYL9EkEjVmPCL7rr27evsU"
  "marketplace:69ZFM7nHUTXcHp8TZpRtX4qr3ERK2VGxRdqXvNtbfJkZ"
  "otc_deals:FmXBAWoSGanaFfP8p9gekgrFn7buEn1XUSFWebDr3Pwz"
  "auctions:6c95kxTWCXacsAev4xnvNbKnLYWFGPpJT5zwT4SnWh5v"
)

echo "============================================================"
echo "Upgrade authority transfer"
echo "------------------------------------------------------------"
echo "  Cluster:       $CLUSTER"
echo "  Keypair:       $KEYPAIR"
echo "  New authority: $NEW_AUTHORITY"
echo "  Programs:      ${#PROGRAMS[@]}"
echo "============================================================"
echo
echo "IMPORTANT: once transferred, the current keypair can NO LONGER"
echo "upgrade these programs. All upgrades must go through the new"
echo "authority (typically a Squads 2-of-N multisig)."
echo
read -r -p "Proceed? [y/N] " confirm
if [[ "${confirm,,}" != "y" && "${confirm,,}" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

fail_count=0
skip_count=0
ok_count=0

for entry in "${PROGRAMS[@]}"; do
  name="${entry%%:*}"
  pid="${entry##*:}"

  echo
  echo "--- $name ($pid) ---"

  # Fetch current authority; skip if already at target.
  current=$(solana program show "$pid" $URL_FLAG 2>/dev/null \
    | awk -F': ' '/Authority/ {print $2; exit}' \
    | tr -d ' \r' || true)

  if [[ -z "$current" ]]; then
    echo "  WARN: could not read current authority (is the program deployed on $CLUSTER?)"
    fail_count=$((fail_count + 1))
    continue
  fi

  if [[ "$current" == "$NEW_AUTHORITY" ]]; then
    echo "  Already at target — skipping."
    skip_count=$((skip_count + 1))
    continue
  fi

  echo "  Current authority: $current"
  echo "  Transferring..."

  if solana program set-upgrade-authority \
       "$pid" \
       --new-upgrade-authority "$NEW_AUTHORITY" \
       --skip-new-upgrade-authority-signer-check \
       $URL_FLAG \
       --keypair "$KEYPAIR"; then
    ok_count=$((ok_count + 1))
  else
    echo "  FAILED for $name"
    fail_count=$((fail_count + 1))
  fi
done

echo
echo "============================================================"
echo "  Transferred: $ok_count"
echo "  Skipped:     $skip_count"
echo "  Failed:      $fail_count"
echo "============================================================"

if (( fail_count > 0 )); then
  echo "Some programs failed. Re-run this script to retry; already-done"
  echo "programs will be skipped."
  exit 1
fi

echo "All done. Verify with:"
echo "  for pid in \\"
for entry in "${PROGRAMS[@]}"; do
  echo "    ${entry##*:} \\"
done
echo "  ; do solana program show \$pid $URL_FLAG | grep Authority; done"
