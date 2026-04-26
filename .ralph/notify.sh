#!/bin/bash
# notify.sh — send a Telegram message
# Usage: ./notify.sh "Title" "Body"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/.env" ] && { set -a; source "$SCRIPT_DIR/.env"; set +a; }

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    echo "[notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env" >&2
    exit 0
fi

TITLE="${1:-Ralph}"
BODY="${2:-}"
HOST=$(hostname -s)

MSG=$(printf "*%s* (%s)\n%s" "$TITLE" "$HOST" "$BODY")

curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MSG}" \
    --data-urlencode "parse_mode=Markdown" \
    > /dev/null
