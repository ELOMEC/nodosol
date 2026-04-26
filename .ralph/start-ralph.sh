#!/bin/bash
# start-ralph.sh — wrap ralph in caffeinate + tmux for clean detach
# Usage:
#   ./start-ralph.sh        # start a new tmux session 'ralph'
#   ./start-ralph.sh attach # attach to running session
#   ./start-ralph.sh stop   # stop running session
#   ./start-ralph.sh tail   # tail the log

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RALPH_SH="$SCRIPT_DIR/ralph.sh"
LOG_FILE="$SCRIPT_DIR/ralph.log"
SESSION="ralph"

case "${1:-start}" in
    start)
        if tmux has-session -t "$SESSION" 2>/dev/null; then
            echo "Ralph već radi. './start-ralph.sh attach' za pregled, ili 'stop' za prekid."
            exit 1
        fi
        if ! command -v tmux >/dev/null; then
            echo "ERROR: tmux not installed. Run: brew install tmux"
            exit 1
        fi
        if ! command -v caffeinate >/dev/null; then
            echo "ERROR: caffeinate missing (this is not macOS?)"
            exit 1
        fi
        tmux new-session -d -s "$SESSION" "caffeinate -dimsu bash '$RALPH_SH'"
        echo "Ralph started in tmux session '$SESSION'."
        echo "  Attach:  ./start-ralph.sh attach"
        echo "  Tail:    ./start-ralph.sh tail"
        echo "  Stop:    ./start-ralph.sh stop"
        ;;
    attach)
        tmux attach -t "$SESSION"
        ;;
    stop)
        tmux kill-session -t "$SESSION" 2>/dev/null && echo "Stopped." || echo "Nije pokrenut."
        ;;
    tail)
        tail -f "$LOG_FILE"
        ;;
    status)
        if tmux has-session -t "$SESSION" 2>/dev/null; then
            echo "Ralph radi (tmux session: $SESSION)"
        else
            echo "Ralph nije pokrenut"
        fi
        ;;
    *)
        echo "Usage: $0 {start|attach|stop|tail|status}"
        exit 1
        ;;
esac
