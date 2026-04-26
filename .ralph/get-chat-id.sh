#!/bin/bash
# get-chat-id.sh — discover your Telegram chat_id for the .env
#
# Usage:
#   1. Otvori novog NodosolBot-a u Telegramu i pošalji mu BILO ŠTA (npr. "hi")
#   2. Pokreni:  ./get-chat-id.sh <NEW_TOKEN>
#      Skripta vraća chat_id koji ide u .env kao TELEGRAM_CHAT_ID

set -euo pipefail

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
    echo "Usage: $0 <TELEGRAM_BOT_TOKEN>" >&2
    echo "Tip: nemoj kopirati token u shell history. Bolje:" >&2
    echo "  read -s TOKEN && $0 \"\$TOKEN\"" >&2
    exit 1
fi

if ! command -v jq >/dev/null; then
    echo "ERROR: jq not installed. Run: brew install jq" >&2
    exit 1
fi

RESPONSE=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates")
CHAT_ID=$(echo "$RESPONSE" | jq -r '[.result[].message.chat.id] | unique | .[]' 2>/dev/null)

if [ -z "$CHAT_ID" ]; then
    echo "Nije nadjen ni jedan chat_id." >&2
    echo "Provjeri da li si poslao poruku botu i da li je token tacan." >&2
    echo "Raw response:" >&2
    echo "$RESPONSE" | jq . >&2 2>/dev/null || echo "$RESPONSE" >&2
    exit 1
fi

echo "Chat ID(s) found:"
echo "$CHAT_ID"
echo ""
echo "Stavi gornji broj kao TELEGRAM_CHAT_ID u .ralph/.env"
