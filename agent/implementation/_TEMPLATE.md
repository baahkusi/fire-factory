# Step NN — Title

**Spec:** §...
**Status:** ⬜ Not started

## Goal

One paragraph describing what this step delivers.

## Prerequisites

- Step ... approved.

## Entry points

List every route, script, or page this step adds or changes.

## Build order

1. Rules, indexes, collection shapes.
2. Domain types.
3. Stores.
4. Provider adapters.
5. Controllers.
6. Routes and web.
7. Tests (`agent/TEST.md`).
8. After human approval: reconcile `INVARIANTS.md` once for this step.

## Deliverables

| File/Area | Action |
|-----------|--------|
| `functions/src/...` | ... |

## Verification checklist

### Tests

- [ ] New behavior has automated coverage.
- [ ] Unit tests for pure logic.
- [ ] API tests for new routes.
- [ ] Emulator test if the step depends on Firestore rules or the Admin SDK, or a note explaining why not.
- [ ] `agent/TEST.md` updated if commands or files changed.
- [ ] `npm test` and, when relevant, `npm run test:emulator` pass.
- [ ] `npm run lint` and `npm run typecheck` pass.

### Step quality

- [ ] SPEC still describes the behavior.
- [ ] On approval: invariant claims reconciled in one pass.
- [ ] Invariant run only if the human asked.

## Notes

Claims and invariant runs: `agent/INVARIANTS.md` only.
