#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="/www/wwwroot/ecg.tianhao.me"
if [ ! -d "$TARGET" ]; then
  echo "missing production directory: $TARGET" >&2
  exit 2
fi
if [ ! -f "$TARGET/app/config.local.php" ]; then
  echo "missing $TARGET/app/config.local.php; create local DB config first" >&2
  exit 3
fi
# Preserve production-local secrets, sessions, logs, cache, .user.ini and the
# target's pre-existing panel files. Copy only application code/content.
tar -C "$ROOT" \
  --exclude='.git' --exclude='.ssh' --exclude='node_modules' \
  --exclude='storage/sessions/*' --exclude='storage/logs/*' --exclude='storage/cache/*' \
  --exclude='tests/artifacts/*' --exclude='app/config.local.php' \
  --exclude='storage/master.key' --exclude='docs/*.local.md' \
  -cf - . | tar -C "$TARGET" -xf -
mkdir -p "$TARGET/storage/sessions" "$TARGET/storage/logs" "$TARGET/storage/cache"
chown -R www:www "$TARGET"
chmod 700 "$TARGET/storage/sessions" "$TARGET/storage/logs" "$TARGET/storage/cache" 2>/dev/null || true
echo "deployed $ROOT -> $TARGET"
echo "run: nginx -t && nginx -s reload"
