#!/usr/bin/env bash
# Re-run provisioning, the GitHub deployer secret, and App Hosting.
# Generated for Firebase Project: fire-factory-si (Region: us-central1)
set -euo pipefail

PROJECT_ID="fire-factory-si"
REGION="us-central1"
WEB_APP_ID=""
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  Deployments Setup: $PROJECT_ID ($REGION)"
echo "=========================================================="

echo "→ Provisioning Firebase (Firestore, Storage, Auth, Web app, deployer)..."
npm run provision -- --project="$PROJECT_ID" --region="$REGION" --yes

if [[ -n "$(git status --porcelain)" ]]; then
  echo "→ Committing working tree..."
  git add .
  git commit -m "Configure deployments for $PROJECT_ID" || echo "Notice: commit skipped."
else
  echo "✔ Git working tree is clean."
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "→ Pushing to main..."
  git push -u origin main || echo "Notice: push skipped."
else
  echo "→ No git remote origin detected. Add with: git remote add origin <url>"
fi

echo "→ Publishing the GitHub deployer secret..."
npm run provision -- --project="$PROJECT_ID" --region="$REGION" --yes --secret-only

FIREBASE_BIN="firebase"
if ! command -v firebase >/dev/null 2>&1; then
  if npx --no-install firebase --version >/dev/null 2>&1; then
    FIREBASE_BIN="npx firebase"
  fi
fi

if command -v firebase >/dev/null 2>&1 || [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
  echo "→ Creating App Hosting backend 'web'."
  echo "  The first run opens a browser so you can authorize the GitHub repository."
  $FIREBASE_BIN apphosting:backends:create --project="$PROJECT_ID" --backend=web --primary-region="$REGION" --root-dir=frontend || echo "Notice: App Hosting creation did not complete. Re-run after firebase login."
else
  echo "Notice: firebase CLI not available. Install with: npm install -g firebase-tools"
fi

echo ""
echo "✔ Deployment setup complete for $PROJECT_ID!"
