#!/usr/bin/env bash
# Records the syncsim walkthrough video for the portfolio with the ui-demo skill
# (~/.claude/skills/ui-demo): builds the playground, serves it locally, checks
# every step of demo/flow.mjs, records it, and renders a small web video plus a
# poster image.
#
#   ./demo.sh                        -> demos/syncsim.mp4 + demos/syncsim.jpg
#   ./demo.sh --publish              -> records, pushes them to the demo-video branch
#                                       and starts the Pages deploy, which serves them at
#                                       https://hemant10yadav.github.io/syncsim/demos/
#   ./demo.sh --publish --no-record  -> pushes the video already in demos/
#
# The Record Pass opens a Chrome window (the skill records headed for sharp 2x
# frames); leave it alone until it closes. The skill's tooling lives in
# ~/Desktop/record and is set up on first run.
#
# Overrides: DEMO_PORT (default 4180), RECORD_DIR (default ~/Desktop/record),
# UI_DEMO_SKILL (default ~/.claude/skills/ui-demo).
set -euo pipefail
cd "$(dirname "$0")"

SKILL=${UI_DEMO_SKILL:-$HOME/.claude/skills/ui-demo}
RECORD_DIR=${RECORD_DIR:-$HOME/Desktop/record}
TASK_DIR=$RECORD_DIR/syncsim-walkthrough
PORT=${DEMO_PORT:-4180}
BASE=http://localhost:$PORT/syncsim/
OUT_DIR=demos
NAME=syncsim
BRANCH=demo-video

publish=false
record=true
for arg in "$@"; do
  case $arg in
    --publish) publish=true ;;
    --no-record) record=false ;;
    *) echo "usage: ./demo.sh [--publish [--no-record]]" >&2; exit 1 ;;
  esac
done

need() { command -v "$1" >/dev/null || { echo "missing: $1 ($2)" >&2; exit 1; }; }

record_video() {
  need ffmpeg "brew install ffmpeg"
  need node "Node 24"
  [ -f "$SKILL/runner.mjs" ] || { echo "ui-demo skill not found at $SKILL" >&2; exit 1; }

  # The skill's shared tooling: Playwright in node_modules, Pillow in a venv.
  if [ ! -d "$RECORD_DIR/node_modules/@playwright/test" ]; then
    echo "==> setting up $RECORD_DIR (first run only)"
    mkdir -p "$RECORD_DIR"
    (cd "$RECORD_DIR" && { [ -f package.json ] || npm init -y >/dev/null; } && npm install --silent playwright @playwright/test)
  fi
  if [ ! -x "$RECORD_DIR/venv/bin/python" ]; then
    python3 -m venv "$RECORD_DIR/venv"
    "$RECORD_DIR/venv/bin/pip" install --quiet pillow
  fi
  (cd "$RECORD_DIR" && npx playwright install chromium >/dev/null)

  mkdir -p "$TASK_DIR/output"
  cp "$SKILL/runner.mjs" "$SKILL/render.py" "$TASK_DIR/"
  cp demo/flow.mjs "$TASK_DIR/flow.mjs"

  echo "==> building the playground"
  npm run build --silent >/dev/null

  if curl -s -o /dev/null "$BASE"; then
    echo "port $PORT is busy; set DEMO_PORT to a free one" >&2
    exit 1
  fi
  echo "==> serving the build at $BASE"
  (cd apps/playground && exec npx vite preview --port "$PORT" --strictPort) >"$TASK_DIR/output/preview.log" 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  for _ in $(seq 1 50); do curl -s -o /dev/null "$BASE" && break; sleep 0.2; done
  curl -s -o /dev/null "$BASE" || { echo "preview server did not start; see $TASK_DIR/output/preview.log" >&2; exit 1; }

  echo "==> checking every step (Verify Run)"
  (cd "$TASK_DIR" && DEMO_BASE=$BASE node flow.mjs >/dev/null) || {
    echo "a step failed; details in $TASK_DIR/output/report.json" >&2
    exit 1
  }

  echo "==> recording (a Chrome window opens; leave it until it closes)"
  (cd "$TASK_DIR" && DEMO_BASE=$BASE node flow.mjs --record >/dev/null)

  kill "$server" 2>/dev/null || true
  trap - EXIT

  echo "==> rendering"
  (cd "$TASK_DIR" && "$RECORD_DIR/venv/bin/python" render.py --task . --scale 1 --crf 24 --max-mb 7 >/dev/null)

  mkdir -p "$OUT_DIR"
  cp "$TASK_DIR/output/final.mp4" "$OUT_DIR/$NAME.mp4"
  ffmpeg -hide_banner -loglevel error -y -i "$TASK_DIR/output/poster.png" -q:v 3 "$OUT_DIR/$NAME.jpg"
  echo "    $(du -h "$OUT_DIR/$NAME.mp4" | cut -f1) video, poster $OUT_DIR/$NAME.jpg"
}

$record && record_video

if $publish; then
  need gh "brew install gh, then gh auth login"
  [ -f "$OUT_DIR/$NAME.mp4" ] && [ -f "$OUT_DIR/$NAME.jpg" ] || { echo "nothing to publish in $OUT_DIR/" >&2; exit 1; }
  # The branch holds only demos/, as one commit replaced on every publish, so
  # re-recorded videos never pile up in history. The Pages deploy copies demos/
  # into the site.
  pages=$(mktemp -d)
  trap 'git worktree remove --force "$pages" 2>/dev/null || true' EXIT
  git worktree add --detach "$pages" >/dev/null
  git -C "$pages" checkout --orphan "$BRANCH-publish" >/dev/null 2>&1
  git -C "$pages" rm -rfq . >/dev/null
  mkdir -p "$pages/demos"
  cp "$OUT_DIR/$NAME.mp4" "$OUT_DIR/$NAME.jpg" "$pages/demos/"
  printf '[{"name":"%s","title":"Walkthrough"}]\n' "$NAME" >"$pages/demos/list.json"
  git -C "$pages" add -f demos
  git -C "$pages" commit -qm "walkthrough video from $(git rev-parse --short HEAD)"
  git -C "$pages" push -qf origin "HEAD:$BRANCH"
  git -C "$pages" checkout -q --detach
  git branch -D "$BRANCH-publish" >/dev/null
  # The branch has no workflows of its own, so the push does not deploy; start it here.
  gh workflow run pages.yml --ref main
  echo "published to $BRANCH and started the Pages deploy; live in a minute or two at:"
  echo "  https://hemant10yadav.github.io/syncsim/demos/$NAME.mp4"
  echo "  https://hemant10yadav.github.io/syncsim/demos/$NAME.jpg"
fi
