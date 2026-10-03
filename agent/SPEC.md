# SPEC — Fire Factory

**Status:** Factory skeleton approved as a starting base.
**Version:** 0.1

This document is the contract for the base repository. A fork keeps §§2–12
unless the human changes the architecture, and replaces §1.4 with the product.

## 1. Purpose

Fire Factory is the repo you copy when starting a Firebase product that coding
agents will help build. It fixes the runtime decisions (who may write, where
Auth stops, how local tests run) and the agent decisions (spec before plan,
plan before code, claims separate from unit tests).

### 1.1 What the factory ships

- HTTPS API on Cloud Functions v2, one Express app, export name `api`.
- `GET /health` with `service`, `status`, and `store` (`memory` or `firestore`).
- Firebase Auth email/password on the web shell.
- Session: `GET /api/session`, `PATCH /api/session` for `displayName` only.
- Staff grant: `staff/{email}`, custom claims `{roles}`, optional
  `profiles/{uid}`. Operator script `create-admin`. Admin-only
  `GET /api/admin/staff`.
- Append-only `audit` records for profile display-name changes.
- Firestore and Storage rules that deny client writes by default.
- Emulator Suite for live tests. Unit tests use an in-memory store.
- Next.js shell: `/`, `/login`, `/account`.

### 1.2 Users of the factory

- The human who forks the repo and approves the product spec.
- Coding agents that follow `agent/AGENTS.md`.
- End users of a fork, once §1.4 describes them. The factory itself has only
  a member and an admin so the path can be exercised.

### 1.3 Non-goals

- No product domain: no catalogue, enrolment, payments, CMS, chat, or jobs.
- No email vendor, no payment vendor, no scheduled jobs.
- No client-side Firestore writes.
- No guarantee about App Hosting being connected. The web app is ready to be
  the App Hosting root (`frontend/`).
- The `x-test-user` header is not a demo mode for production.

### 1.4 Product slot

This subsection is intentionally empty of product behavior.

When this repo is forked, replace this subsection with:

- the problem and who it is for
- what v1 does
- what v1 does not do
- nouns the system stores, if they are not already in §4

Do not start product routes until this subsection is human-approved. Do not
import a previous product's collections to "have something to show."

## 2. Runtime

### 2.1 Processes

| Process | Role | Default |
|---------|------|---------|
| `frontend` | Next.js App Router | port 3000 |
| `functions` | Express API, also exported as Cloud Function `api` | port 5001 |
| Firebase emulators | Auth, Firestore, Functions, Storage, hub, UI | 9099, 8080, 5001, 9199, 4400, 4000 |
| `scripts` | Admin SDK operators (`create-admin`, posture check) | one-shot |

`npm run dev` runs the web app and the API with `USE_MEMORY_STORE=1` so a
checkout of the repo runs with no credentials. That process is not production.

### 2.2 Stack

- Node.js 22, npm workspaces for `functions` and `scripts`.
- `frontend/` is self-contained (own `package-lock.json`).
- TypeScript, Zod at the HTTP boundary, Vitest, ESLint.
- `firebase-admin` on the server. Firebase JS SDK in the browser.
- Cloud Functions v2 `onRequest`. CORS is enforced by the Express app
  (`cors: false` on the function so the platform does not add a second policy).
- Region default `us-central1` (`FUNCTION_REGION`). Firestore location default
  `us-central1` in `firebase.json`. Change the database location before first
  create.

### 2.3 Code layout inside `functions/src`

| Path | Responsibility |
|------|----------------|
| `types/` | Domain types. No vendor SDK types. |
| `validators/` | Zod schemas for request bodies. |
| `stores/` | Firestore or memory. Collection names live in `types/domain.ts`. |
| `providers/` | Firebase Admin, and later HTTP vendors. |
| `controllers/` | One workflow per handler. |
| `routes/` | Wire HTTP to controllers. Routers stay thin. |
| `scheduled/` | Extension list for future scheduled functions. Empty. |
| `side-effects/` | Extension list for future out-of-band work. Empty. |
| `lib/sanitize.ts` | Control-character stripping and angle-bracket removal on input. |
| `app.ts` | Express factory: CORS, JSON, rate limit, health, errors. |
| `index.ts` | Cloud Function export. |
| `local-server.ts` | `listen()` for local Node. |

New product code follows that order. A new collection gets a store, a rule
decision in `firestore.rules`, and a SPEC sentence before a route.

### 2.4 Web

`frontend/app` is the App Router. `frontend/lib/config.ts` reads public env.
`frontend/lib/firebase.ts` owns the Auth client. `frontend/lib/api.ts` sends
`Authorization: Bearer <idToken>` to the API. Pages do not call Firestore.

### 2.5 Environments

| Name | Store | Auth |
|------|-------|------|
| `npm run dev` | memory | web SDK against the configured project, if keys exist |
| `npm test` | memory | `x-test-user`, because `NODE_ENV=test` |
| emulators | Firestore emulator | Auth emulator |
| production | Firestore | Firebase Auth. Memory store and test auth refuse to boot |

`assertProductionSafety` runs when the Functions module loads. It throws if
`NODE_ENV=production` and `FUNCTIONS_EMULATOR` is not `true` and either
`USE_MEMORY_STORE=1` or `ALLOW_TEST_AUTH=1` is set.

## 3. Identity and roles

### 3.1 Roles

`member` | `operator` | `admin`

Privileged roles are `operator` and `admin`.

### 3.2 Resolution

On every authenticated request the API computes roles:

1. `staff/{email}` if `active` and the row contains a privileged role. That
   list is the session's roles.
2. If a staff row exists and `active` is false, the session is `member`,
   even when the ID token still says `admin`.
3. Else `profiles/{uid}.roles` if they contain a privileged role.
4. Else custom claim `roles` if they contain a privileged role.
5. Else any remaining known role on the profile or claims.
6. Else `member`.

Unknown role strings are dropped. The client cannot set roles. `PATCH
/api/session` accepts only `displayName`.

### 3.3 Sign-in side effect

A successful auth with an email calls `touchProfile`. The profile is created
or updated with the resolved roles. An existing display name is kept when the
token does not supply one.

### 3.4 Test header

`x-test-user: uid|email|role,role` is honored only when `NODE_ENV=test`.
Any other process that receives the header and is not in test mode responds
401. The header is not accepted because a query flag or a hostname looks local.

### 3.5 Granting staff

`scripts/bootstrap/create-admin.ts`:

- Ensures an Auth user when `--password` is at least 8 characters.
- Sets custom claims `{roles: ["admin"|"operator"]}`, merging with existing
  claims.
- Writes `staff/{lowercase email}` with `active: true`.
- Writes `profiles/{uid}` when the Auth user exists.

The person signs out and in so the ID token picks up claims. The staff
document applies on the server even before that refresh.

## 4. Persistence

### 4.1 Collections

| Collection | Document id | Written by | Client |
|------------|-------------|------------|--------|
| `profiles` | Auth uid | Admin SDK | Read own doc, or privileged read. No write. |
| `staff` | lowercase email | Admin SDK (`create-admin` or a future admin API) | Privileged read. No write. |
| `audit` | UUID | Admin SDK | No read, no write. |

`audit` fields: `id`, `actorUid`, `action`, `target`, `at` (ISO-8601).
Profile display-name updates append `profile.display_name_updated`.

Timestamps are ISO strings, not Firestore Timestamp objects, so memory and
Firestore return the same JSON.

### 4.2 Rules

`firestore.rules` denies every path, then allows the reads in the table above.
A new collection is closed until a rule allows a specific read. Do not open
`allow read, write: if request.auth != null`.

### 4.3 Storage

- `users/{uid}/**`: owner or privileged read. Owner write under 25 MB, content
  types png, jpeg, webp, pdf, or text/plain. SVG, HTML, and JavaScript are
  rejected.
- `public/**`: world read, no client write.
- Everything else: deny.

Prefer signed URLs from Functions when the product needs uploads the owner
should not push directly.

### 4.4 Indexes

`audit` is indexed by `actorUid` ASC, `at` DESC. Add indexes with the query
that needs them, in `firestore.indexes.json`.

## 5. HTTP API

Base path `/api`. JSON errors: `{error: {code, message}}`.

| Code | Status |
|------|--------|
| `invalid-request` | 400 |
| `unauthenticated` | 401 |
| `forbidden` | 403 |
| `not-found` | 404 |
| `conflict` | 409 |
| `internal` | 500 |

Messages that look like stack traces, filesystem paths, or Firestore index
URLs are replaced with a generic sentence. Zod failures return field messages,
not the raw issue array.

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/health` | public |
| `GET` | `/api/session` | signed in |
| `PATCH` | `/api/session` | signed in, body `{displayName}` |
| `GET` | `/api/admin/staff` | `admin` |

Unknown paths return JSON 404. Rate limit: 120 requests / minute / IP on
`/api`. Health is not rate limited. CORS allows configured `ALLOWED_ORIGINS`,
`PUBLIC_SITE_URL`, and localhost outside production. A missing `Origin`
(server-to-server, tests) is allowed.

`/health` returns exactly `service`, `status`, and `store`. It does not echo
env, keys, or whether test auth is on.

## 6. Web shell

- `/` explains the factory and links to sign-in and account. It does not call
  the API.
- `/login` email/password sign-in and account create, when web config is
  present. Otherwise it tells the human which env file to fill.
- `/account` loads `GET /api/session` with the ID token and can save a display
  name.

The shell is a proof of the wire, not a design system. A product replaces
these pages under its own plan step.

## 7. Security invariants the code must keep

See `agent/INVARIANTS.md` for the register. The load-bearing ones:

- Production refuses the memory store and `ALLOW_TEST_AUTH`.
- Test auth is `NODE_ENV=test` only.
- Inactive staff cannot remain privileged via a stale claim.
- Display-name updates do not change roles.
- Client SDK cannot write `profiles`, `staff`, or `audit`.

## 8. Local verification

| Command | Proves |
|---------|--------|
| `npm test` | Health shape, session, role resolution, sanitizing, production guard. Frontend config. |
| `npm run test:emulator` | Admin SDK round-trip and Firestore rules (self read, no client write, no stranger read). |
| `npm run lint` / `npm run typecheck` | Functions, scripts, frontend. |
| `npm run production-posture -- --api=URL` | Deployed health store is `firestore`. |

Emulator tests skip when `FIRESTORE_EMULATOR_HOST` is unset. Skipping them in
`npm test` is correct, not a pass of the rules claim. The rules claim is
proven by `npm run test:emulator` or by an invariant run that executed it.

## 9. Deploy

- `firebase deploy --only functions` runs `functions/scripts/predeploy.sh`
  (eslint, then `tsc`) before upload.
- Rules and indexes deploy separately.
- Service-account JSON stays out of git.
- `npm run production-posture` after the first production deploy.

## 10. Agent workflow

Documented in `agent/AGENTS.md`. Short form: SPEC, then plan steps, then code
bottom-up, then tests, then human approval, then one invariant reconciliation
for that step. Maintenance is a human declaration, one file per request under
`agent/maintenance/`.

## 11. Configuration reference

| Variable | Where | Meaning |
|----------|-------|---------|
| `FB_PROJECT_ID` | functions, scripts | Firebase project id. Fallback `fire-factory`. |
| `FUNCTION_REGION` | functions | Cloud Functions region. Default `us-central1`. |
| `ALLOWED_ORIGINS` | functions | Comma-separated browser origins. |
| `PUBLIC_SITE_URL` | functions | Extra allowed origin. |
| `USE_MEMORY_STORE` | functions | `1` selects memory. Forbidden in production. |
| `ALLOW_TEST_AUTH` | functions | Forbidden in production. The header still requires `NODE_ENV=test`. |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | API origin, no trailing path. Default `http://127.0.0.1:5001`. |
| `NEXT_PUBLIC_FIREBASE_*` | frontend | Web SDK config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` | frontend | `host:port` for the Auth emulator. |
| `FIRESTORE_EMULATOR_HOST` | functions, scripts | Standard emulator variable. |
| `FIREBASE_AUTH_EMULATOR_HOST` | functions, scripts | Standard emulator variable. |

## 12. Fork checklist (human)

1. New git remote. New Firebase project id in `.firebaserc` and env examples.
2. Firestore location chosen before first create.
3. Web keys in `frontend/.env.local`.
4. `npm test` green.
5. §1.4 written and approved.
6. Plan steps appended. Implementation notes filled. No step marked approved
   by the agent.
