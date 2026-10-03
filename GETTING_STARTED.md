# Getting started

This repository is already seeded. It is the base you copy, not an empty
Keystone pack. The agent workflow (spec, plan, invariants, maintenance) is
the one used to build a Firebase product. The runtime is the part worth
keeping: Functions, Firestore, Auth, Storage, emulators, and a web shell.

You own the setup. Edit the SPEC, the plan, the rules, and the layout.
"Approved" means good enough to proceed, not frozen.

## Fork a product

1. Duplicate this repo and point it at a new remote.
2. Create a Firebase project. Run `npm run set-project` to set the project ID
   across `.firebaserc`, `agent/environment.yaml`, and the env files (or pass
   `--project=your-project-id`).
3. Set the Firestore location in `firebase.json` **before the first deploy**.
   It cannot be changed later. The factory default is `us-central1`.
4. Copy env examples (or let `npm run set-project` create them):
   - `frontend/.env.example` → `frontend/.env.local` (web app keys)
   - `functions/.env.example` → `functions/.env`
5. Follow `SETUP.md` until `npm test` passes and you can sign in.
6. Grant yourself admin:
   `npm run create-admin -- --email=you@example.com --password='…'`
   Against emulators, add `--emulator`.

## Write the product

Stay in `agent/SPEC.md` §1.4 until you would defend it.

Suggested prompt:

> Read `GETTING_STARTED.md` and `agent/SPEC.md`. I want to build: [product].
> Update `agent/SPEC.md` §1.4 and any architecture sections the product
> forces you to change. Do not rewrite PLAN, INVARIANTS, or README yet.
> Do not add product routes. Summarize the spec when you are done.

When you approve that spec, ask the agent to append `agent/PLAN.md` steps
and `agent/implementation/NN-*.md` notes. Step 01 is already the skeleton.
The agent must not mark a new step approved. You do that.

Do not copy a previous product's domain back in (cohorts, checkout, catalogue)
unless the new SPEC asks for it.

## While building

- Canonical writes go through Cloud Functions (Admin SDK). Firestore rules
  stay deny-by-default. Add a client read only when the SPEC names it.
- New vendors get a file under `functions/src/providers/`. Domain types do
  not take vendor payloads.
- Roles stay `member`, `operator`, and `admin` until the SPEC adds one.
- `USE_MEMORY_STORE=1` and `x-test-user` are for local tests. Production
  boot refuses the memory store.

## Maintenance

After you declare the build done, new work is one file per request under
`agent/maintenance/`. Do not keep extending `PLAN.md` unless you open a new
major build.
