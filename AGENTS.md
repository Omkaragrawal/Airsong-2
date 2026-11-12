# AGENTS.md

This file provides guidance to AI coding agents (Codex, Cursor, and others) when working with code in this repository.

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

## Rule 1 — Think Before Coding

State assumptions explicitly. If uncertain, ask rather than guess.
Push back when a simpler approach exists. Stop when confused.

## Rule 2 — Simplicity First

Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.

## Rule 3 — Surgical Changes

Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting. Match existing style.

## Rule 4 — Goal-Driven Execution

Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate independently.

## Rule 5 — Token budgets are not advisory

Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh. Surface the breach.

## Rule 6 — Read before you write

Before adding code, read exports, immediate callers, shared utilities.
If unsure why code is structured a certain way, ask.

## Rule 7 — Checkpoint after every significant step

Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back. Stop and restate.

## Rule 8 — Fail loud

"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

## Before coding

Before generating code, review:

- MISTAKES.md - patterns to avoid

## Interaction and authorization protocol

These rules apply whenever an AI coding agent works in this repository.

- Never assume a missing product, API, database, authentication, or error-handling
  decision. Separate verified repository facts, recommendations, and unresolved
  questions explicitly.
- Work one step at a time. Before every file read, command, edit, formatting run,
  test, build, lint run, Git inspection, or database-related source change, state
  the exact action and ask for permission. Approval applies only to that action.
- Before an edit, name the file and show a concise pseudocode or diff outline.
  After the edit, report what changed, whether it matched expectations, and the
  next proposed action; then wait for fresh permission.
- If a command or edit produces an unexpected result, stop and report it. Do not
  attempt an unapproved recovery action.
- Preserve all pre-existing changes. Never reset, discard, overwrite, reformat,
  or “clean up” unrelated work.
- Never create or amend a Git commit. Also do not stage, push, pull, merge,
  rebase, cherry-pick, stash, reset, clean, switch branches, create branches, or
  open a pull request unless a later user instruction explicitly changes the
  relevant restriction.
- Never execute a database write or schema operation. This includes `INSERT`,
  `UPDATE`, `DELETE`, `TRUNCATE`, `MERGE`, `CREATE`, `ALTER`, `DROP`, migrations,
  rollbacks, and seeds. Database source code may be prepared only after showing
  its SQL-equivalent effect and receiving permission; it must not be executed.
- Any proposed read-only database query also requires advance permission. Show
  the environment and exact bounded `SELECT`/`EXPLAIN` first, avoid sensitive
  columns and `SELECT *`, and report only redacted results. No live database read
  is expected.
- Do not run `npm run test:dev`, app startup commands, end-to-end tests, or any
  command that may connect to the staging database. Local development points at
  staging; mock-only unit tests, lint, and build are the safe verification path.
- Do not call live third-party/partner services (payment providers, AA/data
  vendors, Vault, Redis, etc). Never print or log API keys, bearer tokens, PII
  (PAN, mobile numbers, etc), or raw partner payloads.

Use this format before every action:

```text
Action: <one exact action>
Target: <exact file or complete command>
Purpose: <why it is required>
Expected result: <what should happen>
Risk: <read-only, file mutation, resource use, etc.>
Question: May I perform this exact action?
```

## What this is

**Airsong** streams whatever audio is playing on a phone or computer to other devices, such as a TV, a PC or another phone, over WebRTC with low delay. A sender app captures system audio and starts a session with a code and QR code. Receivers open a web page, join the session and play the audio. It's a TypeScript monorepo.

The repo is **not built yet**. [plan.md](plan.md) is the source of truth for the architecture, task order and decisions. If this file and plan.md disagree, follow plan.md and point out the mismatch.

## Commands

Root scripts that exist today (from `package.json`):

```bash
npm run typecheck          # tsc --noEmit with the root tsconfig.json
npm run lint               # eslint --max-warnings=0 . --ext=.ts
npm run lint:fix           # lint with --fix
npm run format             # prettier --write .
npm run commit             # commitizen prompt (git-cz) to write a Conventional Commit message
npm run release:mock       # standard-version --dry-run: preview the version bump and changelog
npm run release            # standard-version: bumps the version, writes CHANGELOG, then COMMITS AND TAGS
```

- `npm test` is still npm's placeholder and always fails. There are no tests yet.
- `npm run lint-build` calls `npm run build`, which doesn't exist yet, so it fails.
- `npm run release` creates a commit and a tag, so the protocol above forbids it unless the user explicitly allows it.
- Planned for Task 1 in plan.md, not available yet: `dev`, `build`, `test`, `typecheck` and `lint` running across every workspace through Turborepo, for example `npx turbo run typecheck lint test`.

### Migrations & seeds (Knex, Postgres)

None. Airsong has no database. The server keeps sessions in memory and loses them on restart, which is by design: a sender just starts a new session. Don't add a database, ORM or migrations unless plan.md records that decision.

### New module

There's no generator. To add a workspace:

1. Create it under `apps/` for an app or `packages/` for a shared library.
2. Its `tsconfig.json` extends a root preset, `tsconfig.node.json` or `tsconfig.bundler.json`. If the framework ships its own base config (Adonis, Expo), use an `extends` array with the framework base first and the root preset last.
3. Its `eslint.config.ts` imports the root config and spreads it. Prettier and commitlint need no file per workspace.
4. Add its name to the commitlint `scope-enum` and its tasks to `turbo.json`.

Task 1 creates these root presets and files. Until then, the root `tsconfig.json` is the only TypeScript config.

## Environments — important quirk

- Node ≥ 26.13.0 and npm ≥ 11.20.0 (`engines` in `package.json`, and `.nvmrc`).
- The sender picks one of two modes, and they behave very differently:
  - **Local mode:** the sender itself serves the receiver page over **plain HTTP** on the LAN (`http://<lan-ip>:47800`). No internet, TLS, STUN or TURN is involved. That's fine because receivers only play audio, and playback doesn't need a secure context.
  - **Web mode:** everything goes through the AdonisJS server, which must use **HTTPS** in production.
- Server settings come from env vars that are checked at startup (planned):
  - `PORT`, `HOST`, `TRUST_PROXY`, `ALLOWED_ORIGINS`
  - `STUN_URLS`, `TURN_URLS`, `TURN_TTL`
  - either `TURN_USERNAME` and `TURN_CREDENTIAL`, or `TURN_SECRET`
- `TURN_SECRET` and any other credentials live only in gitignored env files. Never commit them. Where to host the server isn't decided yet.
- The dev machine is WSL2 Linux. iOS and macOS builds need a Mac with Xcode, or EAS cloud builds, plus an Apple Developer account.

## Architecture

### Module layout

Planned workspaces (plan.md → "Monorepo layout"):

- `apps/server`: AdonisJS v7. Handles web-mode sessions, SSE, relaying offers and answers between receivers and senders (WHEP-style), nearby discovery and ICE servers. Also serves the built receiver and sender-web.
- `apps/receiver`: Vite + TS PWA that plays the audio. It's also bundled inside the native senders for local mode.
- `apps/sender-web`: sender for desktop Chrome and Edge. It's also the Electron app's UI (renderer).
- `apps/sender-desktop`: Electron app with system audio capture (loopback) and the local-mode HTTP server.
- `apps/sender-mobile`: Expo React Native app for Android and iOS. Native modules live in `modules/` and the iOS broadcast extension in `targets/`.
- `packages/protocol`: API shapes, SSE event types, error codes and zod schemas.
- `packages/sender-core`: sender logic that runs on every platform: sessions, answering receiver offers, Opus SDP tuning, transports.

The empty `client/`, `server/` and `index.ts/` folders at the root are older than the plan and aren't part of this layout. Ask before using or removing them.

### Data access — one `DbService`, many repositories

There's no database. Server state lives in two in-memory stores in `apps/server/app/sessions/`:

- `SessionRegistry`: sessions by id and code, nearby lookup by network, a 30 s grace period when a sender disconnects, and a periodic sweep of expired sessions.
- `PendingOffers`: receiver offers waiting for the sender's answer, with a 15 s timeout.

Both take an injected clock so tests control time. State is lost on restart and isn't shared between server instances. Running more than one instance would need a shared store, which the MVP doesn't plan for.

### Auth — global guard + decorators

There are no user accounts.

- **Sender endpoints** (`/api/sessions/:id/...`) need the session's `senderToken` as a Bearer token. The server issues it when the session is created.
- **Receiver endpoints** are public and rate-limited. A receiver needs the session code, or finds the session through nearby discovery if the sender allowed that.
- **Local mode:** the code is the access key (`POST /api/whep?k=<code>`). A wrong key gets `401`.
- Never log sender tokens, session codes or full SDP bodies.

### Response & error envelope

There's no wrapper around responses; each endpoint returns its payload directly.

- **WHEP endpoints** take and return `application/sdp`. A successful offer gets `201`, with the answer SDP as the body and a `Location` header for that receiver's connection.
- **SSE** (`text/event-stream`) carries `offer`, `viewer-left` and `ping` events to the sender.
- **JSON endpoints** return plain JSON. Errors return `{ code, message }` with a matching HTTP status. The codes live in `packages/protocol`: `SESSION_NOT_FOUND`, `SESSION_FULL`, `INVALID_SDP`, `SENDER_TIMEOUT` (`504`), `UNAUTHORIZED`, `RATE_LIMITED`. Add new codes there; never use inline strings.

### Config access

- The server reads config through AdonisJS `env`, which checks it in `apps/server/start/env.ts`. Add every new variable there with its type. Don't read `process.env` directly in feature code.
- Front-end apps read build-time settings from `import.meta.env` (Vite). They decide local or web mode at runtime from `GET /api/info`.

### Cross-cutting

- **Signaling is HTTP only:** receivers send WHEP-style `POST`s, and each sender holds one SSE stream. No WebSockets; plan.md records that decision.
- **Request and message shapes** are zod schemas in `packages/protocol`. The server validates every input with them, and clients import only the types.
- **Audio is Opus stereo** (`stereo=1`, `sprop-stereo=1`, `maxaveragebitrate=128000`, `useinbandfec=1`, `usedtx=0`), tuned by `tuneOpusSdp` in `packages/sender-core`. Don't edit SDP anywhere else.
- **Media is peer-to-peer,** so the server never sees audio. TURN only relays it when NAT blocks a direct path.
- **Native code** is the only code that isn't TypeScript: Kotlin for the Android modules, and Swift for the iOS module and the broadcast extension.

## Conventions enforced by hooks/CI

- **Commit messages:** Conventional Commits through `@commitlint/config-conventional`, enforced by the husky `commit-msg` hook.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. `.versionrc.json` uses the same list for changelog sections.
  - Planned: a `scope-enum` of `server`, `receiver`, `sender-web`, `sender-desktop`, `sender-mobile`, `protocol`, `sender-core`, `repo`, `deps`, `ci`, `docs`, `release`.
  - `npm run commit` gives a guided prompt. Never skip hooks with `--no-verify`.
- **Pre-commit hook:** runs lint-staged, which does three things:
  - `sort-package-json` on `package.json`
  - ESLint with `--fix` on staged TypeScript
  - a full `tsc -p tsconfig.json`, so commits fail on lint or type errors

  Known gap: the ESLint step targets `src/**`, which doesn't exist. ESLint normally errors when a pattern matches no files, so expect that step to fail until it's fixed. This hasn't been checked by running it. Husky setup is skipped when `NODE_ENV=production` or `CI=true` (`.husky/install.mjs`).
- **Releases:** standard-version (`.versionrc.json`). It bumps the version, writes the changelog, commits and tags.
- **Lint and format:** ESLint (typescript-eslint, `--max-warnings=0`) plus Prettier.
- **TypeScript only:** all source, tests, scripts and tool configs are `.ts` or `.tsx`. plan.md lists the only exceptions: Kotlin, Swift, files Expo generates, and a JS config only where a tool can't load TypeScript. Several root configs are still JavaScript today (`commitlint.config.js`, `lint-staged.config.js`, `eslint.config.mjs`, `.prettierrc.mjs`, `ecosystem.config.js`), and Task 1 is due to convert them.
- **Every workspace extends the root configuration** (tsconfig, ESLint, Vitest). A workspace never weakens a root setting without a comment next to it explaining why.

## Naming — declaration suffixes

Every declaration carries a suffix naming what it is:

| Kind | Suffix | Example |
|---|---|---|
| `enum` | `Enum` | `SessionModeEnum`, `ErrorCodeEnum` |
| `type` | `Type` | `SessionType`, `WhepOfferType`, `ViewerStateType` |
| exported const map/object | `Const` | `LatencyModeConst`, `OpusParamsConst` |

- **Use `type`, never `interface`.** Every object shape is a `type` alias with a `Type` suffix. The one exception is adding fields to a library's existing interface, such as Adonis's `HttpContext` or the browser's `Window` for `window.airsongHost`. TypeScript only allows that with `interface`, and those keep the library's name. A lint rule (`@typescript-eslint/consistent-type-definitions: ['error', 'type']`) is planned to enforce this.
- **`Const` means a const map or lookup object,** not every `const`. Single-value constants in `SCREAMING_SNAKE` case, such as `MAX_VIEWERS` or `PENDING_OFFER_TIMEOUT_MS`, keep that form.
- **Classes and functions get no suffix,** for example `SenderSession` and `tuneOpusSdp`. The rule only covers the kinds in the table.

The point of the suffix is that a bare identifier at a call site tells you what you're looking at without jumping to its declaration.

## Testing and data conventions

- **Strengthen the closest existing test** rather than adding a duplicate case. Search for existing coverage before writing a new `it(...)` or `test(...)`.
- **Never hide a failing test.** No `.skip`, `.todo`, `.only`, `test.failing`, weakened assertions, inverted expectations or deleted assertions. Keep the strict assertion failing and report the defect.
- **Deterministic timing.** Use fake timers, injected clocks, deferred promises or explicit barriers, never fixed `sleep`s. Timeouts in the code are injected so tests can control them: the 30 s grace period, the 15 s pending offer, and the 2 s wait for ICE gathering.
- **No real network or devices in unit tests:**
  - `sender-core` tests use a fake `RTCPeerConnection` factory and fake event streams.
  - Server functional tests use a bare `node:http` server on port 0.
  - Fixture SDPs from Chrome, Safari, Firefox and `react-native-webrtc` live next to the tests.
- **Test runners:**
  - Japa (unit and functional) in `apps/server`
  - Vitest in `packages/*`, `apps/receiver` and `apps/sender-web`
  - Jest in `apps/sender-mobile`
  - Playwright for end-to-end tests (web mode and Electron), using a test-tone source instead of real system audio
  - native modules (Kotlin, Swift) are tested by hand on real devices
- **Surface specific failure reasons.** When input is invalid (bad code, malformed SDP, wrong token, full session), return the specific protocol error code, not a generic error, and show a specific message in the UI.
