#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p storage/logs
exec 9>"$ROOT/storage/logs/autocommit.lock"
flock -n 9 || exit 0

GIT=(git -c safe.directory="$ROOT")
"${GIT[@]}" add -A
if "${GIT[@]}" diff --cached --quiet; then
  exit 0
fi

if "${GIT[@]}" diff --cached -U0 | grep -qE 'BEGIN (OPENSSH|RSA|EC) PRIVATE KEY|sk-[A-Za-z0-9]{20,}'; then
  echo "autocommit: secret-like pattern detected, refusing to commit" >&2
  "${GIT[@]}" reset -q
  exit 1
fi

"${GIT[@]}" -c user.name="ECG Lab Auto" -c user.email="auto@ecg.local" commit -m "chore: auto-commit $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null
echo "autocommit: $(date '+%F %T') $(git -c safe.directory="$ROOT" rev-parse --short HEAD)"
