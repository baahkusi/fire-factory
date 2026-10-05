# Setup Guide

Node.js 22 and npm 10. Docker is the recommended way to run Firebase emulators.

---

## Quick Start (3 Steps)

### 1. Install Dependencies
```bash
npm run install:all
```
Installs root workspace dependencies (`functions`, `scripts`) and the standalone `frontend/` package in one command.

### 2. Configure Your Project
```bash
npm run set-project
```
- Interactively prompts for your **Firebase project ID**, **Display Name**, and **Data Center Region**.
- Automatically configures `.firebaserc`, `firebase.json`, package manifests, agent configuration, and templates.
- Creates `frontend/.env.local` and `functions/.env` from `.env.example`.
- When `gcloud` can see the project, provisions the Blaze project: Web app config, email/password Auth, the default Firestore database, the default Storage bucket, and the GitHub deployer roles. The web keys are written into `frontend/.env.local`.
- *(Non-interactive option: `npm run set-project -- --project=your-id --name="App Name" --region=us-central1`)*
- File edits only, no cloud calls: add `--files-only`.

### 3. Configure GitHub Deployments & App Hosting
```bash
npm run setup-github
```
- Generates GitHub Actions CI/CD workflows and Firebase App Hosting configuration (`frontend/apphosting.yaml`), including the web API key and app id.
- **Auto-installs missing tools:** If `gcloud` or `firebase` CLI are missing, the script will prompt and offer to install them for you automatically.
- Provisions the same cloud resources as `set-project` if they are not already there, then stores the deployer key as `FIREBASE_SERVICE_ACCOUNT`.
- Commits and pushes the initial branch to GitHub `main`.
- Connects Firebase App Hosting with `firebase apphosting:backends:create`. The first run opens a browser so you can authorize the GitHub repository.

---

## Local Development

### Option A: In-Memory Mode (Zero Credentials)
Start the frontend and API immediately without Firebase emulators or credentials:
```bash
npm run dev
```
- **Web App:** http://127.0.0.1:3000
- **API Health:** http://127.0.0.1:5001/health (reports `"store": "memory"`)

### Option B: Firebase Emulators (Recommended for Auth & Rules)
Run the full local suite (Auth, Firestore, Storage) with Docker:
```bash
npm run emulators:up          # Start Docker emulators in background
npm run dev:api               # Run API connected to emulators
npm run test:emulator         # Run live integration & rules tests
npm run emulators:down        # Stop emulators
```
- **Emulator UI:** http://127.0.0.1:4000
- Host Java mode (without Docker): `npm run dev:emulators`

---

## Verification & Quality Checks

Run these commands before pushing code:
```bash
npm test                      # Unit tests (memory store)
npm run lint                  # Lint checks across frontend, functions, scripts
npm run typecheck             # TypeScript typecheck across all workspaces
npm run build                 # Production builds (frontend Next.js + functions)
```

---

## Admin Operations

Create your initial admin user:
```bash
# Production:
npm run create-admin -- --email=you@example.com --role=admin

# Against local emulator:
npm run create-admin -- --emulator --email=you@example.com --password='your-password'
```

Verify your deployed API posture:
```bash
npm run production-posture -- --api=https://<region>-<project>.cloudfunctions.net/api
```
`/health` must report `"status": "ok"` and `"store": "firestore"`.

---

## Deployments

### 1. Automated (Continuous Deployment)
Every push to GitHub `main` triggers:
- **GitHub Actions (`deploy.yaml`):** Deploys Firestore rules, indexes, Storage rules, and Cloud Functions `api`.
- **Firebase App Hosting:** Automatically builds and deploys `frontend/`.

### 2. Manual CLI Deploy
Deploy directly from your terminal:
```bash
npm run deploy:base
# or selectively:
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```

---

## Troubleshooting

- **Missing CLI tools (`gcloud` / `firebase`):** `npm run setup-github` detects missing CLI binaries and offers to install them directly (via Homebrew on macOS or official installers on Linux).
- **Health works, sign-in fails:** Re-run `npm run provision -- --project=<id>`. Email/password Auth and `frontend/.env.local` are filled by that command. For the hosted app, the same values belong in `frontend/apphosting.yaml`.
- **API returns 401 on valid token:** Verify `FB_PROJECT_ID` in `functions/.env` matches the project issuing your ID tokens.
- **Admin role not reflected in UI:** Sign out and sign back in to refresh ID token custom claims.
- **Emulator container error:** Run `npm run emulators:logs`. Run `npm run emulators:down` to clear the persistent volume if necessary.
