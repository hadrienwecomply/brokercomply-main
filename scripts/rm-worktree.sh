#!/usr/bin/env bash
#
# rm-worktree.sh — tear down a worktree created by new-worktree.sh.
#
# Removes the worktree (and optionally deletes its branch), then prunes stale
# worktree metadata. Accepts either the branch name or the worktree path.
#
# Usage:
#   scripts/rm-worktree.sh <branch-or-path> [--delete-branch] [--force]
#
set -euo pipefail

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

target=""
delete_branch=0
force=0

while [ $# -gt 0 ]; do
  case "$1" in
    --delete-branch) delete_branch=1; shift ;;
    --force|-f) force=1; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown flag: $1" ;;
    *) [ -z "$target" ] || die "unexpected argument: $1"; target="$1"; shift ;;
  esac
done

[ -n "$target" ] || die "usage: scripts/rm-worktree.sh <branch-or-path> [--delete-branch] [--force]"

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# Resolve a worktree path: accept a literal path, else match a worktree whose
# checked-out branch equals the argument.
if [ -d "$target" ]; then
  wt_path="$(cd "$target" && pwd)"
  branch="$(git -C "$wt_path" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
else
  branch="$target"
  wt_path="$(git -C "$repo_root" worktree list --porcelain \
    | awk -v b="refs/heads/$branch" '
        /^worktree /{p=substr($0,10)}
        $0=="branch "b{print p; exit}')"
  [ -n "$wt_path" ] || die "no worktree found for branch '$branch'"
fi

[ "$wt_path" != "$repo_root" ] || die "refusing to remove the main worktree"

rm_flags=()
[ "$force" -eq 1 ] && rm_flags+=(--force)

printf '→ removing worktree %s (branch %s)\n' "$wt_path" "$branch"
git -C "$repo_root" worktree remove ${rm_flags[@]+"${rm_flags[@]}"} "$wt_path"
git -C "$repo_root" worktree prune

if [ "$delete_branch" -eq 1 ] && [ -n "$branch" ]; then
  printf '→ deleting branch %s\n' "$branch"
  git -C "$repo_root" branch -D "$branch"
fi

printf '✓ done\n'
