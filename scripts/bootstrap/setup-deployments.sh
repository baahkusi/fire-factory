#!/usr/bin/env bash
# Standalone automated setup script for GitHub Actions and Firebase App Hosting.
# Generated for Firebase Project: fire-factory-si (Region: us-central1)
set -euo pipefail

PROJECT_ID="fire-factory-si"
REGION="us-central1"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "  Deployments Setup: $PROJECT_ID ($REGION)"
echo "=========================================================="

# 1. Commit and push repository
if [[ -n "$(git status --porcelain)" ]]; then
  echo "→ Committing working tree..."
  git add .
  git commit -m "Configure deployments for $PROJECT_ID"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "→ Pushing to main..."
  git push -u origin main || echo "Push skipped or branch up to date."
else
  echo "→ No git remote origin detected. Add with: git remote add origin <url>"
fi

# 2. Google Cloud Service Account
if ! command -v gcloud >/dev/null 2>&1; then
  echo "⚠️  Google Cloud SDK ('gcloud') not found in PATH."
  if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    read -p "Install gcloud now via Homebrew ('brew install --cask google-cloud-sdk')? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
      brew install --cask google-cloud-sdk
    fi
  else
    echo "Install gcloud manually: curl -sSL https://sdk.cloud.google.com | bash"
  fi
fi

if command -v gcloud >/dev/null 2>&1; then
  echo "→ Configuring Google Cloud Service Account (github-deployer)..."
  gcloud iam service-accounts create github-deployer \
    --project="$PROJECT_ID" \
    --description="Deploys Firebase Functions and Rules" || true

  ROLES=(
    roles/cloudfunctions.admin
    roles/iam.serviceAccountUser
    roles/firebaserules.admin
    roles/datastore.user
    roles/storage.admin
  )

  for r in "${ROLES[@]}"; do
    echo "  • Granting $r..."
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
      --role="$r" >/dev/null
  done

  echo "→ Generating deployer service account key..."
  KEY_FILE="./github-key.json"
  gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="github-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
    --project="$PROJECT_ID"

  if command -v gh >/dev/null 2>&1; then
    echo "→ Setting FIREBASE_SERVICE_ACCOUNT in GitHub Secrets via gh CLI..."
    gh secret set FIREBASE_SERVICE_ACCOUNT < "$KEY_FILE"
    rm -f "$KEY_FILE"
    echo "✔ GitHub Secret FIREBASE_SERVICE_ACCOUNT configured successfully!"
  elif [[ "$(uname)" == "Darwin" ]] && command -v pbcopy >/dev/null 2>&1; then
    pbcopy < "$KEY_FILE"
    rm -f "$KEY_FILE"
    echo "✔ Service account key copied to macOS clipboard (via pbcopy)!"
    echo "  Paste as secret 'FIREBASE_SERVICE_ACCOUNT' at: GitHub Settings -> Secrets -> Actions"
  else
    echo "✔ Service account key generated at: $KEY_FILE"
    echo "  Add as secret 'FIREBASE_SERVICE_ACCOUNT' in GitHub Settings, then securely delete $KEY_FILE."
  fi
else
  echo "gcloud CLI not installed. Run this script again after installing gcloud."
fi

# 3. Firebase App Hosting
FIREBASE_BIN="firebase"
if ! command -v firebase >/dev/null 2>&1; then
  if npx --no-install firebase --version >/dev/null 2>&1; then
    FIREBASE_BIN="npx firebase"
  else
    echo "⚠️  Firebase CLI not found in PATH."
    read -p "Install firebase-tools globally ('npm install -g firebase-tools')? [Y/n] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
      npm install -g firebase-tools
      if command -v firebase >/dev/null 2>&1; then
        FIREBASE_BIN="firebase"
      fi
    fi
  fi
fi

if command -v firebase >/dev/null 2>&1 || [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
  echo "→ Creating Firebase App Hosting backend 'web'..."
  $FIREBASE_BIN apphosting:backends:create \
    --project="$PROJECT_ID" \
    --backend=web \
    --primary-region="$REGION" \
    --root-dir=frontend
else
  echo "firebase CLI not available. Install with: npm install -g firebase-tools"
fi

echo ""
echo "✔ Deployment setup complete for $PROJECT_ID!"
