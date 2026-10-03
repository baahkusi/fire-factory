# TEST.md

Code tests. Invariant runs are [INVARIANTS.md](./INVARIANTS.md), not this file.

## Commands

```bash
npm test                 # frontend + functions, no emulators required
npm run lint
npm run typecheck
npm run build
npm run emulators:up
npm run test:emulator    # includes Firestore rules
npm run emulators:down
```

Functions unit tests set `USE_MEMORY_STORE=1` and `NODE_ENV=test`
(`functions/vitest.config.ts`). Emulator tests in
`functions/test/emulators.firestore.test.ts` skip unless
`FIRESTORE_EMULATOR_HOST` is set. `npm run test:emulator` sets it.

## Map

| Behavior | Test |
|----------|------|
| Health shape, no extra fields, proxy header | `functions/test/app.test.ts` |
| Session, display name, role smuggling, staff override, inactive staff, admin directory | `functions/test/session.test.ts` |
| `resolveRoles`, error redaction, production guard | `functions/test/roles.test.ts` |
| Admin SDK round-trip, profile rules | `functions/test/emulators.firestore.test.ts` |
| API base URL and Firebase web config presence | `frontend/test/config.test.ts` |

## Not covered by unit tests

- Storage rules (`INV-007`). Cover them with an emulator rules test when a
  product adds uploads, or inspect them during an invariant run (status HELD
  until executed).
- The Next.js pages. They are a thin client over Auth and `/api/session`.
- `create-admin` against a live project. Run it by hand per `SETUP.md`.

## Adding a test

- Pure logic and HTTP: memory store, `x-test-user`.
- Rules or real Firestore: `describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)`.
- Do not point unit tests at production.
