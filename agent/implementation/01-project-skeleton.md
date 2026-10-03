# Step 01 — Project skeleton and local runtime

**Spec:** §1–§12
**Status:** ✅ Approved as the factory base

## Goal

A product-free Firebase application and agent pack that a fork can bind to a
new project. Health, session, staff roles, closed Firestore rules, emulator
tests, a Next.js sign-in shell, and operator scripts.

## Entry points

- `GET /health`
- `GET /api/session`, `PATCH /api/session`
- `GET /api/admin/staff`
- `npm run dev`, `npm test`, `npm run test:emulator`
- `npm run create-admin`, `npm run production-posture`
- Web `/`, `/login`, `/account`

## Deliverables

| Area | Done |
|------|------|
| `functions/src` layers (types, stores, providers, controllers, routes) | [x] |
| Firestore and Storage rules, indexes | [x] |
| Docker emulator compose | [x] |
| `frontend` shell | [x] |
| `scripts/bootstrap/create-admin.ts` | [x] |
| Agent pack (SPEC, PLAN, INVARIANTS, TEST, environment) | [x] |

## Verification checklist

### Tests

- [x] Health, session, roles, sanitizing, production guard, frontend config.
- [x] Emulator tests exist and skip unless `FIRESTORE_EMULATOR_HOST` is set.
- [x] `agent/TEST.md` maps the files.

### Step quality

- [x] SPEC describes this skeleton, with §1.4 left open for the product.
- [x] Claim register written for the skeleton (`INV-001`–`INV-012`).

## Notes

Product milestones are not pre-invented. The fork appends steps 02+ after
§1.4 is approved.
