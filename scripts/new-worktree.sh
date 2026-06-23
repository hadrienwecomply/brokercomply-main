#!/usr/bin/env bash
#
# new-worktree.sh — spin up a git worktree on its own branch so several Claude
# sessions can run in parallel, each in a near-identical environment.
#
# It duplicates the gitignored config a `git worktree` does NOT carry over
# (secrets, local Claude settings, the client allowlist), installs deps, and
# drops you into a Claude session in the new tree.
#
# Usage:
#   scripts/new-worktree.sh <branch> [--from <base-ref>] [--no-install] [--no-claude]
#
# Examples:
#   scripts/new-worktree.sh feat/exports
#   scripts/new-worktree.sh hotfix/login --from main
#   WORKTREES_DIR=~/wt scripts/new-worktree.sh spike/idea --no-claude
#
set -euo pipefail

# --- Gitignored paths to duplicate into the new worktree. ---------------------
# Edit this list to carry over more local-only files/dirs. Missing ones are
# skipped silently; directories are copied recursively.
PORTABLE_PATHS=(
  ".env"
  ".claude"
  "tools/kb-compliance/config/client-allowlist.json"
  # "data"   # runtime/local data — uncomment to copy (can be large)
)

# --- Arg parsing --------------------------------------------------------------
branch=""
base=""
do_install=1
do_claude=1

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --from) base="${2:-}"; [ -n "$base" ] || die "--from needs a ref"; shift 2 ;;
    --no-install) do_install=0; shift ;;
    --no-claude) do_claude=0; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown flag: $1" ;;
    *) [ -z "$branch" ] || die "unexpected argument: $1"; branch="$1"; shift ;;
  esac
done

[ -n "$branch" ] || die "usage: scripts/new-worktree.sh <branch> [--from <base>] [--no-install] [--no-claude]"

# --- Resolve locations --------------------------------------------------------
repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
repo_name="$(basename "$repo_root")"
worktrees_dir="${WORKTREES_DIR:-$(dirname "$repo_root")/${repo_name}.worktrees}"
dir_name="${branch//\//-}"               # feat/x -> feat-x for a flat dir name
target="$worktrees_dir/$dir_name"
[ -n "$base" ] || base="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"

# --- Guards -------------------------------------------------------------------
git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch" \
  && die "branch '$branch' already exists"
[ -e "$target" ] && die "path already exists: $target"

# --- Create the worktree ------------------------------------------------------
mkdir -p "$worktrees_dir"
printf '→ creating worktree %s on branch %s (from %s)\n' "$target" "$branch" "$base"
git -C "$repo_root" worktree add -b "$branch" "$target" "$base"

# --- Duplicate portable (gitignored) assets -----------------------------------
for rel in "${PORTABLE_PATHS[@]}"; do
  src="$repo_root/$rel"
  [ -e "$src" ] || continue
  dst="$target/$rel"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
  printf '  copied %s\n' "$rel"
done

# --- Install deps -------------------------------------------------------------
if [ "$do_install" -eq 1 ]; then
  printf '→ installing dependencies (pnpm install)…\n'
  (cd "$target" && pnpm install)
fi

# --- Done ---------------------------------------------------------------------
cat <<EOF

✓ worktree ready: $target
  branch:   $branch  (base: $base)

  ⚠ all worktrees share the same dev DB (DATABASE_URL copied from .env).
    Don't run integration tests / ingest in two sessions at once — they
    wipe each other.

  next:  cd "$target" && claude
EOF

if [ "$do_claude" -eq 1 ] && command -v claude >/dev/null 2>&1; then
  cd "$target"
  exec claude
fi
