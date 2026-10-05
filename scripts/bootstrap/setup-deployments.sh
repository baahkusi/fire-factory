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
else
  echo "✔ Git working tree is clean."
fi

if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin main >/dev/null 2>&1 || true
  LOCAL_REV="$(git rev-parse HEAD 2>/dev/null || true)"
  REMOTE_REV="$(git rev-parse origin/main 2>/dev/null || true)"
  if [[ -n "$LOCAL_REV" ]] && [[ "$LOCAL_REV" == "$REMOTE_REV" ]]; then
    echo "✔ Branch 'main' is already up to date with origin/main, skipping push."
  else
    echo "→ Pushing to main..."
    git push -u origin main || echo "Notice: Push skipped or branch up to date."
  fi
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
  if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
    echo "⚠️  Google Cloud access denied or project not found for '$PROJECT_ID'."
    echo "   Verify authenticated account: gcloud config get-value account"
    echo "   Switch account if needed:    gcloud auth login"
  else
    echo "→ Checking Google Cloud APIs..."
    REQUIRED_APIS=(
      firebaseapphosting.googleapis.com
      developerconnect.googleapis.com
      run.googleapis.com
      cloudbuild.googleapis.com
      artifactregistry.googleapis.com
    )
    ENABLED_APIS="$(gcloud services list --enabled --project="$PROJECT_ID" --format="value(config.name)" 2>/dev/null || true)"
    MISSING_APIS=()
    for api in "${REQUIRED_APIS[@]}"; do
      if ! echo "$ENABLED_APIS" | grep -qx "$api"; then
        MISSING_APIS+=("$api")
      fi
    done
    if [[ ${#MISSING_APIS[@]} -eq 0 ]]; then
      echo "✔ Required Google Cloud APIs already enabled, skipping."
    else
      echo "→ Enabling missing Google Cloud APIs: ${MISSING_APIS[*]}..."
      gcloud services enable "${MISSING_APIS[@]}" --project="$PROJECT_ID" || true
    fi

    SA_EMAIL="github-deployer@$PROJECT_ID.iam.gserviceaccount.com"
    if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" >/dev/null 2>&1; then
      echo "✔ Service account 'github-deployer' already exists, skipping creation."
    else
      echo "→ Creating Google Cloud Service Account (github-deployer)..."
      gcloud iam service-accounts create github-deployer \
        --project="$PROJECT_ID" \
        --description="Deploys Firebase Functions and Rules" || true
    fi

    ROLES=(
      roles/cloudfunctions.admin
      roles/iam.serviceAccountUser
      roles/firebaserules.admin
      roles/datastore.user
      roles/storage.admin
    )

    ASSIGNED_ROLES="$(gcloud projects get-iam-policy "$PROJECT_ID" \
      --flatten="bindings[].members" \
      --filter="bindings.members:serviceAccount:$SA_EMAIL" \
      --format="value(bindings.role)" 2>/dev/null || true)"

    for r in "${ROLES[@]}"; do
      if echo "$ASSIGNED_ROLES" | grep -qx "$r"; then
        echo "✔ Role $r already granted to github-deployer, skipping."
      else
        echo "  • Granting $r..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
          --member="serviceAccount:$SA_EMAIL" \
          --role="$r" >/dev/null || true
      fi
    done

    SECRET_SET=false
    if command -v gh >/dev/null 2>&1; then
      if gh secret list 2>/dev/null | grep -q "FIREBASE_SERVICE_ACCOUNT"; then
        SECRET_SET=true
      fi
    fi

    if [[ "$SECRET_SET" == "true" ]]; then
      echo "✔ GitHub Secret FIREBASE_SERVICE_ACCOUNT already configured, skipping key generation."
    else
      echo "→ Generating deployer service account key..."
      KEY_FILE="./github-key.json"
      if gcloud iam service-accounts keys create "$KEY_FILE" \
        --iam-account="$SA_EMAIL" \
        --project="$PROJECT_ID"; then
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
        echo "Notice: Could not generate key. You can generate one in Google Cloud Console IAM."
      fi
    fi
  fi
else
  echo "Notice: gcloud CLI not installed. Run this script again after installing gcloud."
fi

# 3. Firebase App Hosting
FIREBASE_BIN="firebase"
if ! command -v firebase >/dev/null 2>&1; then
  if npx --no-install firebase --version >/dev/null 2>&1; then
    FIREBASE_BIN="npx firebase"
  else
    echo "⚠️  Firebase CLI not found in PATH."
    if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
      read -p "Install firebase-cli via Homebrew ('brew install firebase-cli')? [Y/n] " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
        brew install firebase-cli
        if command -v firebase >/dev/null 2>&1; then
          FIREBASE_BIN="firebase"
        fi
      fi
    fi
    if ! command -v firebase >/dev/null 2>&1; then
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
fi

if command -v firebase >/dev/null 2>&1 || [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
  BACKEND_LIST=""
  if [[ "$FIREBASE_BIN" == "npx firebase" ]]; then
    BACKEND_LIST="$(npx firebase apphosting:backends:list --project="$PROJECT_ID" 2>/dev/null || true)"
  else
    BACKEND_LIST="$($FIREBASE_BIN apphosting:backends:list --project="$PROJECT_ID" 2>/dev/null || true)"
  fi

  if echo "$BACKEND_LIST" | grep -q "web"; then
    echo "✔ Firebase App Hosting backend 'web' already exists, skipping creation."
  else
    echo "→ Creating Firebase App Hosting backend 'web'..."
    $FIREBASE_BIN apphosting:backends:create \
      --project="$PROJECT_ID" \
      --backend=web \
      --primary-region="$REGION" \
      --root-dir=frontend || echo "Notice: App Hosting creation did not complete. Check Blaze plan and Developer Connect link."
  fi
else
  echo "Notice: firebase CLI not available. Install with: npm install -g firebase-tools"
fi

echo ""
echo "✔ Deployment setup complete for $PROJECT_ID!"
