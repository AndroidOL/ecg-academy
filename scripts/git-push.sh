#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY="$ROOT/.ssh/github_ecg_academy"
if [ ! -f "$KEY" ]; then
  echo "missing project SSH key: $KEY" >&2
  exit 2
fi
if ! ssh -F /dev/null -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 | grep -q 'successfully authenticated'; then
  echo "project key is not authorized by GitHub yet; add the public key in /tmp/ecg-academy-github.pub as a deploy key with write access" >&2
  exit 3
fi
GIT_SSH_COMMAND="ssh -F /dev/null -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
  git -C "$ROOT" push origin main
