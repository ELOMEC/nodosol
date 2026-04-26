#!/bin/bash
# ralph.sh — autonomous Claude Code loop for NodoSol
# Reads .ralph/progress.md, picks next [ ] task, runs claude headlessly,
# commits result, repeats until queue empty or budget/limits hit.

set -uo pipefail

# === Config (edit if needed) ===
PROJECT_ROOT="/Users/mladenrakic/Documents/GitHub/ELOMEC/Crypto/nodosol"
RALPH_DIR="$PROJECT_ROOT/.ralph"
PROGRESS_FILE="$RALPH_DIR/progress.md"
SPEC_FILE="$RALPH_DIR/feature-spec.md"
BUDGET_FILE="$RALPH_DIR/budget.json"
LOG_FILE="$RALPH_DIR/ralph.log"
NOTIFY="$RALPH_DIR/notify.sh"

MAX_ITER=30
BUDGET_USD=20.0
WALL_CLOCK_HOURS=4
CONSECUTIVE_FAILURE_LIMIT=3
COOLDOWN_SECONDS=20

# Make sure PATH contains node/npm/claude locations even when launched from launchd
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.npm-global/bin:$HOME/.claude/local:$PATH"

# === Resolve claude binary ===
CLAUDE_BIN="$(command -v claude || true)"
if [ -z "$CLAUDE_BIN" ]; then
    echo "ERROR: 'claude' binary not found in PATH. Edit ralph.sh PATH or install Claude Code." >&2
    exit 1
fi

# === Load Telegram env if present ===
if [ -f "$RALPH_DIR/.env" ]; then
    # shellcheck disable=SC1091
    set -a; source "$RALPH_DIR/.env"; set +a
fi

# === Helpers ===
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

notify() {
    if [ -x "$NOTIFY" ]; then
        "$NOTIFY" "$1" "$2" 2>>"$LOG_FILE" || true
    fi
}

count_pending() { grep -cE "^- \[ \]" "$PROGRESS_FILE" 2>/dev/null || echo 0; }
count_done()    { grep -cE "^- \[x\]" "$PROGRESS_FILE" 2>/dev/null || echo 0; }

# === Sanity checks ===
cd "$PROJECT_ROOT" || { log "ERROR: cannot cd to $PROJECT_ROOT"; exit 1; }

if [ ! -f "$PROGRESS_FILE" ]; then
    log "ERROR: $PROGRESS_FILE not found"; exit 1
fi
if [ ! -f "$SPEC_FILE" ]; then
    log "WARNING: $SPEC_FILE not found — continuing anyway"
fi
if ! command -v jq >/dev/null; then
    log "ERROR: jq not installed. Run: brew install jq"; exit 1
fi
if ! command -v bc >/dev/null; then
    log "ERROR: bc not installed. Run: brew install bc"; exit 1
fi

# Refuse to start with dirty working tree (safety: ralph commits a lot)
if [ -n "$(git status --porcelain)" ]; then
    log "ERROR: working tree not clean. Commit or stash first."
    git status --short | tee -a "$LOG_FILE"
    notify "🛑 Ralph nije pokrenut" "Dirty working tree. Commit ili stash pa pokreni ponovo."
    exit 1
fi

# Init budget file
if [ ! -f "$BUDGET_FILE" ]; then
    echo '{"total_cost_usd": 0, "iterations": 0, "started_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' > "$BUDGET_FILE"
fi

# === Create dedicated branch ===
DATE_TAG=$(date +%Y-%m-%d-%H%M)
BRANCH="auto/ralph-$DATE_TAG"
DEFAULT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    git checkout "$BRANCH"
else
    git checkout -b "$BRANCH"
fi
log "Working on branch: $BRANCH (parent: $DEFAULT_BRANCH)"

# === State init ===
START_TS=$(date +%s)
ITER=0
CONSEC_FAIL=0

notify "🚀 Ralph started" "Project: nodosol
Branch: $BRANCH
Budget: \$$BUDGET_USD | Max iter: $MAX_ITER | Wall clock: ${WALL_CLOCK_HOURS}h
Pending: $(count_pending) | Done so far: $(count_done)"
log "=== Ralph started ==="

# === Main loop ===
while [ $ITER -lt $MAX_ITER ]; do
    ELAPSED_HOURS=$(( ($(date +%s) - START_TS) / 3600 ))
    if [ $ELAPSED_HOURS -ge $WALL_CLOCK_HOURS ]; then
        log "Wall clock limit reached (${WALL_CLOCK_HOURS}h)"
        notify "⏰ Ralph stao" "Wall clock ${WALL_CLOCK_HOURS}h"
        break
    fi

    CURRENT_COST=$(jq -r '.total_cost_usd' "$BUDGET_FILE")
    if (( $(echo "$CURRENT_COST >= $BUDGET_USD" | bc -l) )); then
        log "Budget limit reached: \$$CURRENT_COST"
        notify "💸 Ralph stao" "Budget \$$BUDGET_USD potrošen (\$$CURRENT_COST)"
        break
    fi

    if [ "$(count_pending)" -eq 0 ]; then
        log "No pending tasks. Queue empty."
        notify "✅ Sve gotovo" "Svi taskovi završeni. Cost: \$$CURRENT_COST | Branch: $BRANCH"
        break
    fi

    if [ $CONSEC_FAIL -ge $CONSECUTIVE_FAILURE_LIMIT ]; then
        log "Too many consecutive failures, stopping"
        notify "🛑 Ralph stao" "$CONSECUTIVE_FAILURE_LIMIT iteracije zaredom pale. Provjeri ralph.log."
        break
    fi

    ITER=$((ITER+1))
    log "--- Iteration $ITER/$MAX_ITER (cost so far: \$$CURRENT_COST) ---"

    # Prompt is in .ralph/prompt.txt — separate file avoids macOS bash 3.2
    # heredoc parsing bugs around apostrophes and special chars.
    PROMPT=$(cat "$RALPH_DIR/prompt.txt")

    # Run Claude Code headless
    OUTPUT_JSON=$("$CLAUDE_BIN" -p "$PROMPT" \
        --dangerously-skip-permissions \
        --output-format json \
        --max-turns 80 \
        2>>"$LOG_FILE") || {
        log "Iteration $ITER: claude exited non-zero"
        CONSEC_FAIL=$((CONSEC_FAIL+1))
        notify "⚠️ Iter $ITER pala" "claude exit ≠ 0 (consec fail $CONSEC_FAIL/$CONSECUTIVE_FAILURE_LIMIT)"
        sleep $((10 * (CONSEC_FAIL ** 2)))
        continue
    }

    # Parse cost + session id
    ITER_COST=$(echo "$OUTPUT_JSON" | jq -r '(.total_cost_usd // .cost_usd // 0)' 2>/dev/null || echo 0)
    SESSION_ID=$(echo "$OUTPUT_JSON" | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)

    # Update budget
    jq --argjson new "$ITER_COST" '.total_cost_usd += $new | .iterations += 1' "$BUDGET_FILE" > "$BUDGET_FILE.tmp" && mv "$BUDGET_FILE.tmp" "$BUDGET_FILE"
    NEW_TOTAL=$(jq -r '.total_cost_usd' "$BUDGET_FILE")

    log "Iter $ITER done | iter cost \$$ITER_COST | total \$$NEW_TOTAL | session $SESSION_ID"

    # Did Claude make a ralph commit?
    LAST_COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")
    if [[ "$LAST_COMMIT_MSG" == ralph:* ]]; then
        if [[ "$LAST_COMMIT_MSG" == *"blocked"* ]]; then
            log "Task blocked: $LAST_COMMIT_MSG"
            notify "⚠️ Iter $ITER blokiran" "$LAST_COMMIT_MSG
Done: $(count_done) | Pending: $(count_pending) | Total: \$$NEW_TOTAL"
            CONSEC_FAIL=0
        else
            log "Task done: $LAST_COMMIT_MSG"
            notify "✅ Iter $ITER" "$LAST_COMMIT_MSG
Done: $(count_done) | Pending: $(count_pending) | Total: \$$NEW_TOTAL"
            CONSEC_FAIL=0
        fi
    else
        log "WARNING: no ralph: commit detected this iteration"
        CONSEC_FAIL=$((CONSEC_FAIL+1))
        notify "⚠️ Iter $ITER bez commit-a" "Claude nije commit-ovao. Consec fail $CONSEC_FAIL/$CONSECUTIVE_FAILURE_LIMIT"
    fi

    sleep $COOLDOWN_SECONDS
done

# === Final summary ===
TOTAL_COST=$(jq -r '.total_cost_usd' "$BUDGET_FILE")
TOTAL_ITER=$(jq -r '.iterations' "$BUDGET_FILE")
DONE=$(count_done); PENDING=$(count_pending)

log "=== Ralph stopped ==="
log "Iterations total: $TOTAL_ITER | Cost total: \$$TOTAL_COST | Done: $DONE | Pending: $PENDING"
notify "🏁 Ralph završio" "Iter: $TOTAL_ITER | Cost: \$$TOTAL_COST
Done: $DONE | Pending: $PENDING
Branch: $BRANCH
Pregled: cd $PROJECT_ROOT && git log $DEFAULT_BRANCH..$BRANCH --oneline"
