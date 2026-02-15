#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5173/}"
PW_DIR=".playwright/snapshots"
mkdir -p "$PW_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }
}

extract_ref() {
  local file="$1"
  local matcher="$2"
  sed -n "s/.*${matcher}.*\\[ref=\\(e[0-9][0-9]*\\)\\].*/\\1/p" "$file" | head -n1
}

extract_room_code() {
  local file="$1"
  sed -n 's/.*Room: \([0-9][0-9][0-9][0-9]\).*/\1/p' "$file" | head -n1
}

require_cmd playwright-cli
require_cmd node

run_with_retry() {
  local attempts="$1"
  shift
  local n=1
  until "$@"; do
    if [[ "$n" -ge "$attempts" ]]; then
      return 1
    fi
    n=$((n + 1))
    sleep 0.3
  done
}

playwright-cli close-all >/dev/null 2>&1 || true

# Scenario 1: Host flow (entry -> create room -> lobby)
playwright-cli -s=host open "$BASE_URL" >/dev/null
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-entry.txt" >/dev/null
host_nick_ref="$(extract_ref "$PW_DIR/t7s2-host-entry.txt" 'textbox')"
host_create_ref="$(extract_ref "$PW_DIR/t7s2-host-entry.txt" 'button "Create Room"')"
playwright-cli -s=host fill "$host_nick_ref" Hoster >/dev/null
playwright-cli -s=host click "$host_create_ref" >/dev/null
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-lobby.txt" >/dev/null
room_code="$(extract_room_code "$PW_DIR/t7s2-host-lobby.txt")"
if [[ ! "$room_code" =~ ^[0-9]{4}$ ]]; then
  echo "failed to extract room code from host lobby snapshot" >&2
  exit 1
fi

# Scenario 2: Guest flow (join existing room)
playwright-cli -s=guest open "$BASE_URL" >/dev/null
playwright-cli -s=guest snapshot --filename="$PW_DIR/t7s2-guest-entry.txt" >/dev/null
guest_nick_ref="$(extract_ref "$PW_DIR/t7s2-guest-entry.txt" 'textbox')"
guest_code_ref="$(extract_ref "$PW_DIR/t7s2-guest-entry.txt" 'textbox "1234"')"
guest_join_ref="$(extract_ref "$PW_DIR/t7s2-guest-entry.txt" 'button "Join"')"
playwright-cli -s=guest fill "$guest_nick_ref" Guesty >/dev/null
playwright-cli -s=guest fill "$guest_code_ref" "$room_code" >/dev/null
playwright-cli -s=guest click "$guest_join_ref" >/dev/null
playwright-cli -s=guest snapshot --filename="$PW_DIR/t7s2-guest-lobby.txt" >/dev/null
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-lobby-synced.txt" >/dev/null

# Scenario 3: In-game sync (both ready, host start, both in playing)
host_ready_ref="$(extract_ref "$PW_DIR/t7s2-host-lobby-synced.txt" 'button "Ready"')"
guest_ready_ref="$(extract_ref "$PW_DIR/t7s2-guest-lobby.txt" 'button "Ready"')"
playwright-cli -s=host click "$host_ready_ref" >/dev/null
playwright-cli -s=guest click "$guest_ready_ref" >/dev/null
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-ready.txt" >/dev/null
host_start_ref="$(extract_ref "$PW_DIR/t7s2-host-ready.txt" 'button "Start"')"
playwright-cli -s=host click "$host_start_ref" >/dev/null
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-playing.txt" >/dev/null
playwright-cli -s=guest snapshot --filename="$PW_DIR/t7s2-guest-playing.txt" >/dev/null

# Scenario 4: Reconnect flow (guest browser reconnects into same room)
playwright-cli -s=guest close >/dev/null
sleep 0.5
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-after-guest-close.txt" >/dev/null
playwright-cli -s=guest open "$BASE_URL" >/dev/null
playwright-cli -s=guest snapshot --filename="$PW_DIR/t7s2-guest-reentry.txt" >/dev/null
guest_re_nick_ref="$(extract_ref "$PW_DIR/t7s2-guest-reentry.txt" 'textbox')"
guest_re_code_ref="$(extract_ref "$PW_DIR/t7s2-guest-reentry.txt" 'textbox "1234"')"
guest_re_join_ref="$(extract_ref "$PW_DIR/t7s2-guest-reentry.txt" 'button "Join"')"
playwright-cli -s=guest fill "$guest_re_nick_ref" Guesty >/dev/null
playwright-cli -s=guest fill "$guest_re_code_ref" "$room_code" >/dev/null
playwright-cli -s=guest click "$guest_re_join_ref" >/dev/null
playwright-cli -s=guest snapshot --filename="$PW_DIR/t7s2-guest-reconnected.txt" >/dev/null
playwright-cli -s=host snapshot --filename="$PW_DIR/t7s2-host-after-guest-reconnect.txt" >/dev/null

# Authoritative assertions for sync/reconnect/restart
run_with_retry 2 node scripts/ws_patch_consistency_smoke.mjs
run_with_retry 3 node scripts/ws_reconnect_smoke.mjs
run_with_retry 2 node scripts/ws_restart_smoke.mjs

echo "playwright_smoke_scenarios:ok room=${room_code}"
