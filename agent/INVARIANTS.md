# INVARIANTS.md

**This file is the sole authority for invariant process and claims.** Other
agent docs only point here.

Falsifiable claims about the system, grounded in [SPEC.md](./SPEC.md). They
are a living register. An invariant run judges the claims against the repo.
It is not the unit-test suite.

| | Code tests (`TEST.md`) | Invariant runs (this file) |
|--|------------------------|----------------------------|
| Purpose | Regression of units and APIs | Judge whether each claim still holds |
| Trigger | `npm test`, CI, during a step | When the human asks for a run |
| Output | Pass/fail | A new file under `verification/invariant-reports/` |
| Evidence | Test runner | Code, rules, config, and tests if they help |

Tests may support a claim. They do not replace a run. A run can fail a claim
while tests pass.

## Claims register

| ID | Claim |
|----|-------|
| `INV-001` | `GET /health` returns `service=fire-factory`, `status=ok`, and `store` of `memory` or `firestore`, and no other fields. |
| `INV-002` | A production process (`NODE_ENV=production` and `FUNCTIONS_EMULATOR` unset) throws on load if `USE_MEMORY_STORE=1` or `ALLOW_TEST_AUTH=1`. |
| `INV-003` | The `x-test-user` header authenticates a request only when `NODE_ENV=test`. |
| `INV-004` | A signed-in identity with no staff grant, profile role, or claim resolves to `member`, never `operator` or `admin`. |
| `INV-005` | An inactive `staff/{email}` row forces `member` even if custom claims still list `admin` or `operator`. |
| `INV-006` | Client SDK writes to `profiles`, `staff`, and `audit` are denied. Profile reads are limited to the owner or a privileged token. |
| `INV-007` | Storage client writes are limited to `users/{uid}` owned by that uid, under 25 MB, and reject SVG, HTML, and JavaScript content types. |
| `INV-008` | Admin SDK `initializeApp` in application source is only in `functions/src/providers/firebase.ts` and `scripts/utils/firebase-admin.ts`. The emulator test may open its own admin app. The browser uses the client SDK (`firebase/app`), not `firebase-admin`. |
| `INV-009` | `PATCH /api/session` changes `displayName` only. Roles on the stored profile stay as they were. |
| `INV-010` | API error messages do not return stack traces, filesystem paths, or Firestore index-creation text. |
| `INV-011` | Firestore rules deny by default. A collection is readable from the client only where a match explicitly allows it. |
| `INV-012` | Domain types under `functions/src/types/` do not import `firebase-admin` or other vendor SDKs. |

## When the human says "run invariants"

1. Read every active claim. Skip rows marked superseded.
2. Inspect the current repo: code, rules, config, tests.
3. For each claim, record **PROVEN**, **HELD**, **DEFERRED**, **FAIL**, or
   **SUPERSEDED**.
4. You may run `npm test` or `npm run test:emulator` as evidence. Still write
   the report.
5. Copy `verification/invariant-reports/_TEMPLATE.md` to a **new** file
   `verification/invariant-reports/YYYY-MM-DD_HHmmss.md`. Never overwrite a
   report.
6. Reply with a short summary and the report path. Name any **FAIL**.

`INV-006` is PROVEN only if the emulator rules test passed in this run, or
you executed an equivalent rules probe. Reading `firestore.rules` without
running it is **HELD**, not **PROVEN**.

## Reconcile claims

Do this once when a plan step is human-approved, or when a maintenance
request is marked done. Not after every edit.

1. Revise wording in place. Keep the ID.
2. Add `INV-NNN` for a new load-bearing guarantee.
3. Supersede obsolete claims in the row (`Superseded by INV-…`). Do not
   delete or renumber.
4. If the SPEC is wrong, the human approves the SPEC change first.

## Status legend

| Status | Meaning |
|--------|---------|
| PROVEN | Checked against behavior or an executed test in this run. |
| HELD | Code and rules read as supporting the claim; behavior was not executed. |
| DEFERRED | Not yet implemented, or the check needs an environment this run lacks. |
| FAIL | The claim is false in the current tree. |
| SUPERSEDED | The row is historical. |
