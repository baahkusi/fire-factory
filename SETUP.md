# Setup

Node.js 22 and npm 10. Docker is the supported way to run emulators. A local
JDK 17 also works for `npm run dev:emulators`.

## Install

```bash
npm install
cd frontend && npm install && cd ..
```

`frontend/` keeps its own lockfile so Firebase App Hosting can build that
directory alone. `functions` and `scripts` are npm workspaces of the root.

## Environment

```bash
npm run set-project
```

This prompts for your Firebase project ID, updates `.firebaserc`,
`agent/environment.yaml`, and the env example files, and automatically creates
and updates `frontend/.env.local` and `functions/.env` by default. You can also run it
non-interactively:

```bash
npm run set-project -- --project=your-firebase-project-id
```

Fill the `NEXT_PUBLIC_FIREBASE_*` keys in `frontend/.env.local` from the
Firebase web app. Leave `USE_MEMORY_STORE` and `ALLOW_TEST_AUTH` unset in
`functions/.env`.

## Run without a Firebase project

```bash
npm run dev
```

- Web: http://127.0.0.1:3000
- API: http://127.0.0.1:5001/health (memory store)

Sign-in on `/login` needs the web config and a real or emulated Auth project.
The home page and `/health` do not.

## Emulators

```bash
npm run emulators:up          # Docker, background
npm run test:emulator         # functions tests, including rules
npm run emulators:down
```

UI: http://127.0.0.1:4000

To develop the API against the emulators instead of the memory store:

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export STORAGE_EMULATOR_HOST=127.0.0.1:9199
export FB_PROJECT_ID=fire-factory
npm run dev:api
```

In another terminal, `cd frontend && npm run dev`, and set
`NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in
`frontend/.env.local`.

Host Java, no Docker:

```bash
npm run dev:emulators
```

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

`npm test` skips emulator tests when `FIRESTORE_EMULATOR_HOST` is unset.

## Operators

Create or grant an admin (production credentials, or `--emulator`):

```bash
npm run create-admin -- --email=you@example.com --role=admin
npm run create-admin -- --emulator --email=you@example.com --password='at-least-8'
```

Place a `*firebase-adminsdk*.json` under `scripts/` or use
`GOOGLE_APPLICATION_CREDENTIALS`. Those JSON files are gitignored.

After deploy, confirm the live API is on Firestore:

```bash
npm run production-posture -- --api=https://<region>-<project>.cloudfunctions.net/api
```

`/health` must report `"store": "firestore"`.

## Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
```

Set the Firestore location in `firebase.json` before the first database
create. App Hosting, if you use it, uses `frontend/` as the root.

## Troubleshooting

- **Health works, sign-in does not.** Web keys or the Auth emulator host
  are missing. `/login` says so when the keys are empty.
- **API returns 401 with a valid user.** The ID token is from a different
  project than `FB_PROJECT_ID`, or the emulator host is not set on the API
  process.
- **Staff role not applied.** Sign out and sign in. Custom claims ride on
  the ID token. The staff document still applies server-side on the next
  request once the email matches, even before the token refreshes.
- **Emulator container unhealthy.** First boot installs dependencies. Check
  `npm run emulators:logs`. `emulators:down` deletes the data volume.
