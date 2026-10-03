# Fire Factory

Fire Factory is a starting base for a software product on Firebase. Copy the
repository, bind a Firebase project, and write the product into `agent/SPEC.md`.
The academy, catalogue, and payment code from the project this was extracted
from are not here.

What you get on day one:

- A Keystone-style agent pack (`agent/SPEC.md` is the contract, `agent/PLAN.md`
  is the build order, `agent/INVARIANTS.md` is the claim register).
- Cloud Functions (Express) in front of Cloud Firestore. The client SDK does
  not write product data.
- Firebase Auth, with roles resolved from a staff directory, then the profile,
  then custom claims. A signed-in user is a `member` until granted
  `operator` or `admin`.
- A small Next.js shell that signs in and calls `GET /api/session`.
- Firebase Emulator Suite in Docker, plus unit tests that do not need Java.

## Use case

- **Problem:** New Firebase products keep re-deciding where Auth stops, where
  Admin SDK starts, and how an agent is supposed to change the system.
- **Users:** The human who forks this repo, and the coding agents that work
  in the fork.
- **v1 does:** Health check, email/password sign-in, session profile,
  display-name update, staff grants, deny-by-default Firestore and Storage
  rules, emulator live tests, operator scripts.
- **v1 does not:** A product domain. No courses, payments, catalogues, CMS,
  email vendor, or job board. Add those in the fork by editing the SPEC first.

## Project layout

```
.
├── README.md                 # Use case + layout (this file)
├── GETTING_STARTED.md        # Fork, then write the product spec
├── SETUP.md                  # Local install and run
├── AGENTS.md                 # Agent entry → agent/AGENTS.md
├── package.json              # root scripts; workspaces = functions + scripts
├── firebase.json             # Firebase + emulator ports
├── firestore.rules           # Deny by default; profile read for self
├── storage.rules
├── docker-compose.test.yaml  # Emulator Suite for live tests
├── docker/
├── frontend/                 # Next.js shell (own package-lock)
├── functions/                # Express API on Cloud Functions v2
│   └── src/                  # routes, controllers, stores, providers
├── scripts/                  # set-project, setup-github, create-admin, production posture
└── agent/                    # SPEC, PLAN, INVARIANTS, TEST
```

## Where to look

| Question | File |
|----------|------|
| What should we build? | `agent/SPEC.md` |
| What's next? | `agent/PLAN.md` |
| What must stay true? | `agent/INVARIANTS.md` |
| How do I run this? | `SETUP.md` |
| How do I start a product? | `GETTING_STARTED.md` |
| Agent session rules | `AGENTS.md` → `agent/AGENTS.md` |

## Quick commands

```bash
npm run install:all
npm test && npm run lint && npm run typecheck
npm run dev                     # Next.js + in-memory API
npm run emulators:up && npm run test:emulator && npm run emulators:down
```

## Status

**Factory skeleton.** Step 01 in `agent/PLAN.md` is the base you are reading.
A fork adds product milestones after the human approves a product SPEC.
Do not treat this repository as a finished application.
