# AGENTS.md

Instructions for coding agents working in a Fire Factory repo. Read this file
at the start of every session.

## Bootstrap

Humans start in [GETTING_STARTED.md](../GETTING_STARTED.md).

This repo ships with a working skeleton and an approved factory SPEC. It is
not an empty pack.

1. **Product SPEC** — Until the human approves the product description, edit
   **`agent/SPEC.md` §1.4** (and architecture sections only when the product
   forces a change). Do not add product routes, collections, or plan steps.
2. **Plan the product** — When the human asks to update the rest: append
   `PLAN.md` rows and filled `implementation/NN-*.md` notes derived from the
   approved product SPEC. Do not invent steps the SPEC does not support.
   Do not mark them `✅`.
3. **Human may revise anything** — SPEC, plan, notes, and code layout are
   living. Human edits win. Re-align derived docs. Agent-proposed
   product-meaning SPEC changes and step `✅` still need explicit approval.

## Quick start

1. Read this file.
2. Read the relevant `agent/SPEC.md` sections.
3. Check **phase** on `agent/PLAN.md`:
   - **Build:** current step in `PLAN.md` + the `implementation/` note.
   - **Maintenance:** only after the human declares it. See
     [maintenance/README.md](./maintenance/README.md).
4. If the human says **run invariants**: follow [INVARIANTS.md](./INVARIANTS.md)
   only.
5. `README.md` is use case and layout. `SETUP.md` is how to run it.

## Authority

1. `agent/SPEC.md` — product meaning and architecture.
2. `agent/INVARIANTS.md` — claims and the invariant-run process.
3. `agent/PLAN.md` + `implementation/` — build plan.
   `agent/maintenance/` — per-request plans after maintenance is declared.
4. `agent/environment.yaml` — commands and runtime.
5. `README.md` — use case and folder layout. On-disk tree wins for layout.
6. `SETUP.md` — local setup.
7. Existing code — align it with the above.

For product meaning, the SPEC wins. For layout, the tree wins.

## Core principles

- Canonical state lives in Cloud Firestore. Functions use the Admin SDK.
  Client writes stay denied unless the SPEC names a specific read or upload.
- Roles are `member`, `operator`, and `admin`. Resolution order: active staff
  directory by email, inactive staff forces `member`, profile roles, custom
  claims, then `member`.
- Firebase Admin initialization stays in `functions/src/providers/firebase.ts`
  and `scripts/utils/firebase-admin.ts`.
- Third-party HTTP belongs in `functions/src/providers/`. Vendor payloads do
  not leak into domain types or API responses.
- `USE_MEMORY_STORE=1` and the `x-test-user` header exist for tests and
  `npm run dev`. Production must refuse the memory store.
- Do not add a product feature that the SPEC does not describe.
- Invariant procedure lives only in `INVARIANTS.md`. Invariant runs are not
  a substitute for `npm test`.
- Re-infer the README layout when the tree changes.

## Implementation order inside a plan step

1. Data definitions (rules, indexes, collection shapes).
2. Domain types.
3. Stores.
4. Provider adapters.
5. Controllers / workflows.
6. Routes and web surfaces.
7. Write or update tests (`TEST.md` and the step's Tests checklist).
8. After the human approves the step, reconcile `INVARIANTS.md` once for
   that step.
9. Run invariants only when asked.

## When to stop and ask

- Changing SPEC domain semantics.
- Changing plan order, or marking a step approved.
- Changing Auth, Firestore, or the deploy model.
- Adding an external integration or a new role.
- Entering maintenance, or starting a new major build plan.
- The human asked for product code and §1.4 is still the empty factory slot.

## Session report

- What changed, and which SPEC sections.
- Whether claims were reconciled or an invariant report was written (path).
- Whether the README layout was updated.
- Code test results, if you ran them.
- The next plan step, if there is one.
