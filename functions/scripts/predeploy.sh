#!/usr/bin/env bash
# Lint + compile without `npm run`.
# Firebase CLI's embedded npm can crash calling npm scripts.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$DIR"

resolve() {
  local path
  for path in "$@"; do
    if [[ -f "$path" ]]; then
      echo "$path"
      return 0
    fi
  done
  return 1
}

ESLINT="$(resolve \
  "$ROOT/node_modules/eslint/bin/eslint.js" \
  "$DIR/node_modules/eslint/bin/eslint.js" \
  || true)"
TSC="$(resolve \
  "$DIR/node_modules/typescript/bin/tsc" \
  "$ROOT/node_modules/typescript/bin/tsc" \
  || true)"

if [[ -z "${ESLINT}" ]]; then
  echo "eslint not found. Run npm install from the monorepo root." >&2
  exit 1
fi
if [[ -z "${TSC}" ]]; then
  echo "typescript (tsc) not found. Run npm install from the monorepo root." >&2
  exit 1
fi

echo "→ eslint"
node "$ESLINT" --ext .ts src test

echo "→ tsc"
node "$TSC" --project tsconfig.json

echo "predeploy ok"
