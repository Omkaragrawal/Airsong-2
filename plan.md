# Airsong — Implementation Plan (v2)

## Context

The repo (`Omkaragrawal/Airsong-2`) has root tooling configs but no application code yet; work happens on branch `feat/mvp`. The product: **stream whatever audio is playing on a device** (phone or PC) to other devices such as a TV, PC or another phone, with low latency, over WebRTC.

Decisions from the user, including feedback on v1:
- **The sender captures system audio,** not files or links. Phone browsers can't do that, so the senders are native apps:
  - **Android app** and **iOS app**, built with React Native (Expo dev builds)
  - **desktop app** (Electron)
  - **desktop browser sender** (Chrome/Edge `getDisplayMedia`, web mode only)
- **The sender creates the session** and shows a code and QR code. **The receiver** is a separate web app that plays the audio and needs nothing installed.
- **The sender picks a mode:**
  - **Local:** the sender runs a small HTTP server and shows a URL based on its LAN IP. Devices on the LAN open that URL. No internet is needed.
  - **Web:** the sender registers with the public server. Receivers find it **automatically** if they're on the same network (same public IP), or enter the **code or QR** from anywhere.
- **No WebSockets.** WebRTC needs a one-time exchange of an SDP offer and answer before audio flows. That's done with **WHEP-style HTTP**: the receiver sends one `POST` with an SDP offer and gets the SDP answer back. In web mode, the sender holds one **SSE** connection so the server can pass receiver offers to it.
- **Monorepo, one project per app:** the server is separate, and the sender and receiver are separate apps.
- **Server:** AdonisJS v7. The repo runs on Node 26.13.0+ and npm 11.20.0+ (`engines` in the root `package.json`, and `.nvmrc`). **Hosting is decided later.** STUN and TURN are configured through env vars.

**Prerequisites and constraints to know now:**
- iOS and macOS builds need a Mac with Xcode, or EAS cloud builds, plus an Apple Developer account. The dev machine is WSL2 Linux.
- Android builds work on Linux (Android SDK, or EAS). Connect a test phone with `adb` over Wi-Fi.
- Android can't capture audio from apps that opt out (`allowAudioPlaybackCapture=false`, some DRM apps). iOS ReplayKit silences DRM audio. These are platform limits. An app on the phone can't get around them by posing as a virtual Bluetooth device, because neither OS allows it. Optional Phase 9 uses a real Bluetooth or AirPlay link to a PC instead.

## Architecture

```
                         ┌──────────── WEB MODE ────────────┐
 Sender (any)            │  AdonisJS server (public, HTTPS) │            Receiver (browser)
 ───────────             │                                  │            ──────────────────
 POST /api/sessions ───▶ │ SessionRegistry (in-memory)      │ ◀── GET /api/sessions/nearby (same public IP)
 SSE  /events      ◀──── │ offer {viewerId, sdp} ───────────│ ◀── POST /api/sessions/:code/whep (SDP offer)
 POST /answers/:vid ───▶ │ resolves pending request ────────│ ──▶ 201 + SDP answer
                         │ GET /api/ice-servers (STUN/TURN) │
                         └──────────────────────────────────┘
                         ┌──────────── LOCAL MODE ──────────┐
 Sender embeds an HTTP server on LAN  http://<lan-ip>:47800  │
   GET /            → receiver bundle (shipped inside sender)│ ◀── receiver opens URL / scans QR
   POST /api/whep?k=CODE → SDP answer                        │
                         └───────────────────────────────────┘
 Media in both modes: Sender ══ WebRTC / Opus stereo (P2P; TURN relay if NAT blocks) ══▶ Receiver(s)
```

- **The receiver is the WHEP client.** It creates a receive-only audio offer, tuned for Opus stereo, and waits for ICE gathering to finish (or 2 s). It POSTs the full offer (no trickle ICE) and applies the answer. Restarting means sending a new POST.
- **The sender is the WHEP answerer.** It keeps one `RTCPeerConnection` per receiver (default limit 5) and answers with a send-only track. Its answer includes `sprop-stereo=1;stereo=1;maxaveragebitrate=128000;useinbandfec=1;usedtx=0`. Switching sources calls `replaceTrack()`.
- **The receiver code is identical in both modes.** At runtime it calls `GET /api/info` → `{ mode: 'local' | 'web' }` and picks its endpoints from that.
- **Plain HTTP is fine for the receiver in local mode.** It only plays audio, and `RTCPeerConnection` doesn't require a secure context, so there are no certificate problems. Task 9 confirms this on real browsers.
- **Shared sender logic lives in `packages/sender-core`.** It's platform-agnostic: an `RTCPeerConnection` factory and an event-stream factory are passed in. It runs in the browser, in Electron, and in React Native through `react-native-webrtc`, whose API mirrors the W3C one.

## Monorepo layout (npm workspaces + Turborepo)

```
apps/
  server/          AdonisJS v7 — web-mode sessions, SSE, WHEP relay, discovery, ICE servers; serves receiver + sender-web builds
  receiver/        Vite + TS (no framework) PWA — player; its dist is also embedded into native senders for local mode
  sender-web/      Vite + TS — desktop-browser sender UI (also reused as the Electron renderer)
  sender-desktop/  Electron — wraps sender-web; system-audio loopback; local-mode HTTP server in main process
  sender-mobile/   Expo (React Native, dev builds) — Android + iOS
    modules/system-audio/   Expo module (Kotlin): MediaProjection + AudioPlaybackCapture → WebRTC audio
    modules/local-server/   Expo module (Kotlin): embedded HTTP server (receiver assets + /api/whep bridged to JS)
    modules/broadcast/      Expo module (Swift): RPSystemBroadcastPickerView + App Group handoff
    targets/broadcast/      iOS Broadcast Upload Extension (Swift, WebRTC iOS, own SSE + WHEP answerer)
packages/
  protocol/        API shapes, SSE event types, error codes, code/IP utils, zod schemas
  sender-core/     SenderSession, WHEP answering, Opus SDP tuning, ICE-gathering wait, transports (web | local)
```

## Signaling API (`packages/protocol`)

| Mode | Method & path | Caller | Body → Response |
|---|---|---|---|
| web | `POST /api/sessions` | sender | `{name, platform, discoverable}` → `{sessionId, code, senderToken, expiresAt}` |
| web | `GET /api/sessions/:id/events` | sender (Bearer) | SSE: `offer {viewerId, sdp, viewerName}`, `viewer-left {viewerId}`, `ping` |
| web | `POST /api/sessions/:id/answers/:viewerId` | sender (Bearer) | `{sdp}` or `{error}` → 204 |
| web | `DELETE /api/sessions/:id` | sender (Bearer) | → 204 |
| web | `GET /api/sessions/nearby` | receiver | → `[{code, name, platform}]` for the same public IPv4, or the same IPv6 /64, where discoverable |
| web | `GET /api/sessions/:code` | receiver | → `{name, platform}`, or 404 |
| both | `POST /api/sessions/:code/whep` (web) · `POST /api/whep?k=CODE` (local) | receiver | `application/sdp` offer → `201`, answer SDP, `Location: …/whep/:viewerId` |
| both | `DELETE …/whep/:viewerId` | receiver | → 204 |
| both | `GET /api/ice-servers` | both | → `{iceServers, ttl}` (local: `[]`) |
| both | `GET /api/info` | receiver | → `{mode, name?, platform?, version}` |

- **Codes:** 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, normalized to uppercase with spaces and dashes removed.
- **Session lifetime:** a session stays alive while the sender's SSE connection is open, plus 30 s to resume with the same token. Media is peer-to-peer and keeps playing if the server drops.
- **Pending offers:** an offer waiting for the sender's answer times out after 15 s → `504`.

## Repo-wide conventions

These rules apply to every workspace and every task. Task 1 sets them up and CI enforces them (Task 20).

### 1. Every workspace extends the root configuration

Shared settings live once at the repo root. A workspace's own config file only adds what is specific to that workspace.

| Root file | Workspace file |
|---|---|
| `tsconfig.base.json`: strictness and shared flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`, `target: ES2022`) | `tsconfig.json` that extends a root preset. It only sets workspace options such as `lib`, `types` or `jsx`. |
| `tsconfig.node.json` (extends the base): `module`/`moduleResolution: NodeNext`, Node types | Used by `server`, the `sender-desktop` main process, and the `packages/*` libraries. The libraries emit JS and `.d.ts` so every runtime can use them. |
| `tsconfig.bundler.json` (extends the base): `module: ESNext`, `moduleResolution: bundler`, DOM libs | Used by `receiver`, `sender-web` and the `sender-desktop` renderer. |
| `eslint.config.ts`: flat config built on `@adonisjs/eslint-config` and `typescript-eslint` | `eslint.config.ts` that imports the root config and spreads it. It only adds framework rules, such as React Native rules for `sender-mobile`. |
| `.prettierrc.mjs` (existing file, kept), built on `@adonisjs/prettier-config`, with its Edge plugin line removed | None. Prettier finds the root file. |
| `vitest.shared.ts`, plus a root `vitest.config.ts` listing every workspace under `test.projects` | `vitest.config.ts` that uses `mergeConfig` with the shared base. |
| `commitlint.config.js` (existing file, kept, with the scope list added), `.editorconfig`, `.nvmrc` (v26.13.0) | None |

- **Framework base configs:** when a framework ships its own base config (`@adonisjs/tsconfig`, `expo/tsconfig.base`), use an `extends` array with the root preset **last**, so the shared rules win. For example: `"extends": ["@adonisjs/tsconfig/tsconfig.app.json", "../../tsconfig.node.json"]`.
- **No weakening:** a workspace never relaxes a root setting, such as turning off `strict` or a lint rule, without a comment next to the override explaining why.
- **Root `tsconfig.json`:** the existing file is kept. Task 1 makes one edit to it: `exclude` gains `apps`, `packages`, `scratchpad` and `eslint.config.ts` (the `@adonisjs/eslint-config` preset ships no types, so that file can't be typechecked), and `compilerOptions` gains `"types": ["node"]`. Nothing else in it changes. Workspaces extend the presets in the table, not this file.

### 2. All code is TypeScript

- **What counts:** source code, tests, build and repo scripts, and tool config files are all `.ts` or `.tsx`. That includes `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.ts` and Expo's `app.config.ts`.
- **Kept JavaScript files:** five existing files stay JavaScript by the user's decision and are on the allow-list: `.husky/install.mjs`, `.prettierrc.mjs`, `commitlint.config.js`, `ecosystem.config.js` and `lint-staged.config.js`. Don't convert them to TypeScript. They are exempt from the `// @ts-check` rule in the exceptions below.
- **JavaScript is off:** set `allowJs: false` in `tsconfig.base.json`. The kept root `tsconfig.json` still has `allowJs: true`, because only its `exclude` and `types` change.
- **`type`, never `interface`:** every object shape is a `type` alias with a `Type` suffix, for example `SessionType`. Use `interface` only to add fields to a library's existing interface, such as Adonis's `HttpContext` or the browser's `Window`, because TypeScript can't merge a `type` into those. Enforce it with `@typescript-eslint/consistent-type-definitions: ['error', 'type']` in the root `eslint.config.ts` (Task 1). Naming suffixes are listed in AGENTS.md → "Naming — declaration suffixes".
- **Repo scripts:** files in `scripts/` run directly with Node 26.13+ (`node scripts/x.ts`), which only strips types. They use `scripts/tsconfig.json` with `erasableSyntaxOnly: true`, so they can't use enums, namespaces or parameter properties.
- **CI check:** `scripts/check_no_js.ts` fails if any `.js`, `.mjs` or `.cjs` file, tracked or untracked (but not gitignored), is outside the allow-list. Untracked files count because nothing is committed during development. CI runs the same script.
- **Exceptions:** some code can't be TypeScript because the platform requires another language. Keep these as small as possible:
  - Kotlin for the Android Expo modules (Tasks 16–17)
  - Swift for the iOS module and the Broadcast Upload Extension (Tasks 18–19)
  - Files Expo generates in `android/` and `ios/` (gitignored)
  - A JS config file only where a tool can't load TypeScript, for example Metro or Babel in Expo (check in Task 15). Such a file starts with `// @ts-check`, uses JSDoc types, and goes on the allow-list.
  - The Windows Bluetooth helper (Task 21): first try calling the Windows API from TypeScript through a Node binding. Write a native helper only if no maintained binding exists.

### 3. Every commit passes commitlint (Conventional Commits)

- **Setup:** root dev dependencies `@commitlint/cli`, `@commitlint/config-conventional` and `husky`. The root script `"prepare": "node .husky/install.mjs"` installs the hooks, and the existing `.husky/commit-msg` stays as it is: `npx --no-install commitlint --edit "$1"`.
- **`commitlint.config.js`** (existing file, kept):
  - extends `@commitlint/config-conventional`
  - `scope-enum` is an error, and allows the workspace names plus repo-wide scopes: `server`, `receiver`, `sender-web`, `sender-desktop`, `sender-mobile`, `protocol`, `sender-core`, `repo`, `deps`, `ci`, `docs`, `release`
  - `scope-empty` is a warning, so a scope is expected but not mandatory
- **Format:** `type(scope): subject`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Examples:
  - `feat(server): add WHEP relay endpoint`
  - `test(sender-core): cover the viewer limit`
  - `build(repo): add turborepo pipeline`
- **No bypassing:** never commit with `--no-verify`. CI also checks every commit in a PR (Task 20).

### 4. Nothing references plan.md

- **No references:** plan.md is deleted when the project is done, so no code, config or docs may reference it: no "see plan.md" and no "(plan.md, §…)".
- **Comments state their reason directly,** in the comment itself.
- **AGENTS.md** still has references to plan.md. Task 20 updates them and confirms none remain before plan.md is deleted.

## Tasks

Work on branch `feat/mvp`. Never stage or commit: leave every change uncommitted in the working tree for the user, who reviews and commits it. Never push or open PRs. Milestone demos are listed where they apply.

**Checks during development:** no tests are written until Phase 7. Every task must show typecheck with 0 errors, lint with 0 warnings, a successful build and, where something runs, a local run. Dev servers and apps may be started on this machine, with three rules: no external or third-party services, stop every process you start before reporting, and leave no background servers running. For every check, report the exact command, its exit code and the key output lines.

**Before Task 1:** the repo already has config files, and the user has decided what happens to each:
- **Kept:** the five JavaScript files (`.husky/install.mjs`, `.prettierrc.mjs`, `commitlint.config.js`, `ecosystem.config.js`, `lint-staged.config.js`) and `tsconfig.json`. Change them only where Task 1 says so. `.prettierrc.config.ts` also stays, unused.
- **Deleted in Task 1:** `eslint.config.mjs`, `.eslintrc.json` and `.eslintignore`.
- **Off-limits:** `scratchpad/` (the user's own files), `skills-lock.json`, `.claude/`, and the empty root folders `client/`, `server/` and `index.ts/`. Don't read, edit or delete any of them unless the user says so. The root `server/` folder is not `apps/server/`.

### Phase 0 — Foundation

**Task 1: Monorepo scaffold**
- [ ] Root `package.json` (edit the existing file):
  - add `"private": true` and `"workspaces": ["apps/*","packages/*"]`, keep the existing name, description, license and author, remove `main`
  - `engines` stays as it is (Node ≥26.13.0, npm ≥11.20.0)
  - add `"devEngines": { "packageManager": { "name": "npm", "version": "^11.20.0", "onFail": "error" } }`, which turbo needs
  - scripts `dev`, `build`, `test`, `typecheck`, `lint` each become `turbo run <task>`
  - today's root commands stay as `lint:root` (`eslint --max-warnings=0 . --ext=.ts`) and `typecheck:root` (`tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json`), and `lint:fix` becomes `npm run lint:root -- --fix`
  - add `check:no-js`: `node scripts/check_no_js.ts`
  - `prepare` becomes `node .husky/install.mjs`
  - install `turbo`, `vitest`, `vite`, `@adonisjs/eslint-config`, `@adonisjs/prettier-config` and `eslint-plugin-import-x` as dev dependencies, with caret ranges
  - remove five dev dependencies that nothing imports once the old ESLint configs are deleted: `@eslint/compat`, `@eslint/eslintrc`, `eslint-import-resolver-node`, `@eslint/json`, `globals`. Search the remaining configs first to confirm. `eslint-import-resolver-typescript` stays (removed, then re-added), because the import rules need it.
  - the user approves the exact install and uninstall commands before they run
- [ ] Add `turbo.json` (`tasks`: `build` depends on `^build`; `test`, `typecheck`, `lint`; and `dev` with `"cache": false` and `"persistent": true`).
- [ ] Add the new root config files from the conventions above:
  - `tsconfig.base.json`, `tsconfig.node.json`, `tsconfig.bundler.json`
  - `vitest.shared.ts`, `vitest.config.ts`
- [ ] Change the existing root configs, and nothing else in them:
  - `eslint.config.ts`: rewrite it on `@adonisjs/eslint-config` and `typescript-eslint`, including `@typescript-eslint/consistent-type-definitions: ['error', 'type']`. Carry the old config's rules over on top of the AdonisJS preset: its presets (ESLint recommended; typescript-eslint recommended, strict, stylistic and recommended-type-checked), its type-aware rules, and its import rules through `eslint-plugin-import-x`. They apply to `.ts` and `.tsx` files only. Delete `eslint.config.mjs`, `.eslintrc.json` and `.eslintignore`.
  - `tsconfig.json`: add `apps`, `packages`, `scratchpad` and `eslint.config.ts` to `exclude` (the `@adonisjs/eslint-config` preset ships no types, so that file can't be typechecked), and add `"types": ["node"]`.
  - `.prettierrc.mjs`: remove the Edge plugin line. Don't add a `prettier.config.ts`.
  - `lint-staged.config.js`: replace the `"src/**"` ESLint command so it lints the staged files that lint-staged passes in, and delete the dead `eslint-disable` comment on line 1.
  - `.editorconfig` and `.nvmrc` already exist and don't change.
- [ ] Set up commitlint: add the scope list to the existing `commitlint.config.js` (`scope-enum` as an error with the scopes from the conventions above, and `scope-empty` as a warning). Don't add a `commitlint.config.ts`. `.husky/commit-msg` stays as it is.
- [ ] Add `scripts/check_no_js.ts`, plus `scripts/tsconfig.json` and the root script `check:no-js`. The script:
  - lists files with `git ls-files --cached --others --exclude-standard` and skips paths that aren't on disk
  - fails on any `.js`, `.mjs` or `.cjs` file not on the allow-list
  - allow-list: `.husky/install.mjs`, `.prettierrc.mjs`, `commitlint.config.js`, `ecosystem.config.js`, `lint-staged.config.js`
- [ ] Every workspace scaffolded in later tasks replaces the generator's config files with ones that extend these root files.
- [ ] Extend `.gitignore` with `build`, `apps/sender-mobile/android/`, `apps/sender-mobile/ios/` (Expo regenerates these), `apps/server/public/` and `playwright-report`. `dist`, `.turbo` and `.env` are already in it.
- [ ] **Verify:**
  - `npx turbo run typecheck` (an empty pass is fine)
  - `npm test` (through turbo) runs with nothing to execute; report what it actually does
  - `npm run typecheck:root` shows 0 errors, and `npm run lint:root` shows 0 errors and 0 warnings
  - `npm run check:no-js` passes
  - `echo "bad message" | npx commitlint` fails, and `echo "build(repo): scaffold monorepo" | npx commitlint` passes
  - `git status --short` shows only the intended changes, with nothing staged or committed by the agent

**Task 2: `packages/protocol`**
- [ ] Add the types for every row of the API table, plus SSE event types and error codes: `SESSION_NOT_FOUND`, `SESSION_FULL`, `INVALID_SDP`, `SENDER_TIMEOUT`, `UNAUTHORIZED`, `RATE_LIMITED`.
- [ ] Add zod schemas. SDP is at most 16 KB and must start with `v=0`; names are at most 40 characters.
- [ ] Add `generateCode`, `normalizeCode`, `isCode`, and `networkKey(ip)`. `networkKey` returns the IPv4 address as-is, the /64 prefix for IPv6, and unwraps IPv4-mapped IPv6.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 3: `packages/sender-core`**
- [ ] `opus.ts` → `tuneOpusSdp(sdp, opts)`: find the Opus payload type from `a=rtpmap:<pt> opus/48000/2` and merge into its `a=fmtp:<pt>` line without duplicating keys.
  - The receiver side uses `stereo=1`. The sender side adds `sprop-stereo=1`, `maxaveragebitrate`, `useinbandfec=1` and `usedtx=0`.
- [ ] `gather.ts` → `waitForIceGathering(pc, timeoutMs = 2000)`.
- [ ] `sender_session.ts` → `SenderSession({ createPeerConnection, getIceServers, maxViewers })`:
  - `setTrack(track)` swaps the track on every connection with `replaceTrack`
  - `answer(viewerId, offerSdp)` → answer SDP:
    1. `setRemoteDescription`
    2. find the audio transceiver and `replaceTrack`, direction `sendonly`
    3. create the answer, tune it, `setLocalDescription`
    4. wait for ICE gathering
    5. `sender.setParameters({ encodings: [{ maxBitrate: 160_000, priority: 'high' }] })`
  - `removeViewer(id)`, `viewers` (with state), `close()`, and events for viewer state changes
- [ ] `transports/web.ts` → `WebTransport({ baseUrl, eventStream })`:
  - creates the session, subscribes to SSE, answers each offer through `SenderSession`, POSTs the answer or an error
  - reconnects the SSE with backoff and the same token
  - `EventStreamFactory` is passed in: fetch streaming in browsers and Electron, `react-native-sse` in React Native
- [ ] `transports/local.ts` → `handleLocalWhep(req)`: a pure function the native or Electron HTTP servers call. It checks `k`, gets the answer, and returns a response.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

### Phase 1 — Server scaffold

**Task 4: Server scaffold (AdonisJS v7)**
- [ ] `npm init adonisjs@latest apps/server` with the most minimal kit (no Lucid, no auth). Check the kit flags with `--help` first.
- [ ] `config/bodyparser.ts`: add `application/sdp` to the raw types, and read it with `request.raw()`.
- [ ] `config/app.ts`: `trustProxy` from env, so discovery sees the real client IP behind Caddy.
- [ ] `@adonisjs/cors`: allow the `/api/sessions*` sender endpoints from `ALLOWED_ORIGINS`, which covers the Electron `app://airsong` origin and dev origins.
- [ ] Routes: `GET /api/health`, `GET /api/info` (`mode: 'web'`).
- [ ] Static serving with SPA fallback from `apps/server/public/`, which is empty until Phase 2: the receiver build will be served at `/` and the sender-web build at `/send/`. Serve `sw.js` and `index.html` with `no-cache`.
- [ ] **Verify:** `node ace serve --hmr`, and `curl :3333/api/info` responds.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

### Phase 2 — Web apps (receiver + desktop browser sender)

**Task 9: `apps/receiver` (Vite + TS PWA)**
- [ ] Use `vite-plugin-pwa` with `injectManifest`, plus a manifest and icons. In dev, proxy `/api` → `:3333`.
- [ ] Spike first: from a plain `http://<lan-ip>` page, check that `RTCPeerConnection` and audio playback work in Android Chrome, iOS Safari and one TV browser.
- [ ] `src/whep.ts` → `connect(endpoint, { iceServers })`:
  1. add a `recvonly` audio transceiver
  2. create the offer and tune it with `stereo=1`
  3. wait for ICE gathering
  4. POST the offer and apply the answer
  - Reconnect on `failed`, or after `disconnected` lasts 5 s, by POSTing again with backoff. `DELETE` on leave.
- [ ] Screens:
  - **Home (web mode):** a "Nearby" list that polls `/api/sessions/nearby` every 3 s, plus code entry. A `/r/:code` deep link opens the player directly.
  - **Home (local mode):** a single "Start listening" button, with the code taken from the URL `#k=`.
  - **Player:** "Tap to start" to unlock autoplay, `<audio playsinline>`, volume (hidden on iOS), mute, and latency mode set with `receiver.jitterBufferTarget` (low 0.03 / normal 0.15 / stable 0.5 s, feature-detected), sender name and status, a stats panel (bitrate, RTT, jitter, loss, buffer), Wake Lock, fullscreen.
  - Every control works with a keyboard or TV remote (arrow-key focus, large `:focus-visible` rings).
- [ ] Expose a stats hook only in test mode. The Playwright tests in Phase 7 read audio stats through it.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 10: `apps/sender-web` (Vite + TS)**
- [ ] Use `sender-core` with `WebTransport` and a fetch-stream `EventStreamFactory`. `base: '/send/'`.
- [ ] Sources:
  - **System/tab audio:** `getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include', selfBrowserSurface: 'exclude' })`. Stop the video tracks, and show an error if there's no audio track ("tick *Share system/tab audio*"). Handle `track.onended`.
  - **Test tone:** an `OscillatorNode` → `MediaStreamDestination`, shown only in dev or test.
- [ ] UI:
  - "Start sharing" → shows the code and a QR code for `${origin}/r/${code}`
  - viewer list with status, a "Visible to nearby devices" toggle, "Stop"
  - Firefox and Safari get an "unsupported" note
- [ ] The mode switch exists but shows only **Web** when the host can't run a local server. The Electron host turns on **Local** in Task 13.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

- [ ] **Phase 2 check:** the root `build` copies the receiver and sender-web `dist` folders into `apps/server/public`, and the server serves the receiver at `/` and sender-web at `/send/`.

### Phase 3 — Server signaling (sessions, SSE, WHEP relay, ICE servers)

**Task 5: SessionRegistry and PendingOffers**
- [ ] `app/sessions/session_registry.ts`:
  - `create({ name, platform, discoverable, ip })` → `{ sessionId, code, senderToken }`
  - `byCode`, `byId`, `nearby(ip)` (by `networkKey`)
  - `attachSender(id)` / `detachSender(id)` with a 30 s grace period, `sweep(now)`
  - the clock is passed in
- [ ] `app/sessions/pending_offers.ts`: `create(sessionId)` → `{ viewerId, promise }`, then `resolve(viewerId, sdp)`, `reject(viewerId, err)`, and a timeout (15 s, passed in).
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 6: Sender endpoints and SSE**
- [ ] `app/controllers/sessions_controller.ts`: `store` and `destroy`. `app/middleware/sender_auth_middleware.ts`: Bearer `senderToken`.
- [ ] `app/sessions/sse.ts`: a `PassThrough` stream sent with `response.stream(...)`.
  - Headers: `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`.
  - `ping` every 15 s, and `detachSender` on close.
  - Make sure no compression middleware buffers this route.
- [ ] `POST /api/sessions/:id/answers/:viewerId` resolves the pending offer.
- [ ] Rate limits: 10 session creations per IP per minute.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 7: Receiver WHEP endpoints and discovery**
- [ ] `app/controllers/whep_controller.ts`: `POST /api/sessions/:code/whep`:
  1. validate the SDP
  2. create a pending offer
  3. push the `offer` SSE event to the sender
  4. wait for the answer → `201` with `Content-Type: application/sdp` and a `Location` header
  5. `504` on timeout, `404` if the session is unknown or the sender is gone
- [ ] `DELETE …/whep/:viewerId` sends a `viewer-left` event.
- [ ] `GET /api/sessions/nearby` and `GET /api/sessions/:code`.
- [ ] Rate limit: 20 failed code lookups per IP per minute.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 8: ICE servers endpoint**
- [ ] Env vars:
  - `STUN_URLS`, defaulting to `stun:stun.l.google.com:19302`
  - `TURN_URLS`
  - `TURN_USERNAME` + `TURN_CREDENTIAL` for static credentials, or `TURN_SECRET` for coturn's `use-auth-secret`, which generates `username = <expiry>:<rand>` and `credential = base64(HMAC-SHA1(secret, username))`
  - `TURN_TTL`
- [ ] `GET /api/ice-servers` sends `no-store`.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.
- [ ] **Milestone 1 demo:** Chrome on Windows sends system audio → a TV or phone browser plays it through the public server. Before deployment, the "public server" is the dev server on the LAN, or a tunnel.

### Phase 4 — Desktop native sender (Electron)

**Task 12: `apps/sender-desktop` scaffold and system audio**
- [ ] Use the latest stable Electron (≥ 39). The main process is TypeScript, built with esbuild. The renderer is the sender-web build, served through the custom protocol `app://airsong`.
- [ ] Main process:
  ```ts
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const [screen] = await desktopCapturer.getSources({ types: ['screen'] })
    cb({ video: screen, audio: 'loopback' })   // Windows; macOS 14.2+ via CoreAudio Tap
  })
  ```
- [ ] macOS: add `NSAudioCaptureUsageDescription` to Info.plist.
- [ ] Linux: loopback isn't available, so list `enumerateDevices()` audio inputs whose label starts with "Monitor of" (PulseAudio/PipeWire) and capture them with `getUserMedia({ audio: { deviceId } })`.
- [ ] Preload exposes `window.airsongHost = { platform, canHostLocal: true, startLocalServer, stopLocalServer, onLocalWhep }`.
- [ ] Add a test-tone source that is passed in through env. The Electron tests in Phase 7 use it.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 13: Local mode in Electron**
- [ ] Main process runs a `node:http` server on `0.0.0.0:47800`, or the next free port:
  - serves the receiver `dist` (from `extraResources`)
  - `GET /api/info` → `{ mode: 'local', name, platform }`
  - `GET /api/ice-servers` → `[]`
  - `POST /api/whep?k=` and `DELETE` are sent to the renderer over IPC, `sender-core` `handleLocalWhep` runs there, and the reply comes back. Time out after 10 s.
- [ ] LAN IPs come from `os.networkInterfaces()` (non-internal IPv4). The UI lets you pick the interface, shows the QR code for `http://<ip>:<port>/#k=<code>`, and shows the URL as text.
- [ ] Ask for or explain the OS firewall prompt on first run.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 14: Electron packaging**
- [ ] `electron-builder` targets: Windows NSIS, macOS dmg (signing and notarization later), Linux AppImage. Include the receiver dist in `extraResources`.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.
- [ ] **Milestone 2 demo:** Windows PC in **local** mode with the internet unplugged; a phone opens the LAN URL from the QR code and hears system audio.

### Phase 5 — Android sender (Expo / React Native)

**Task 15: `apps/sender-mobile` scaffold (shared UI for Android and iOS)**
- [ ] `npx create-expo-app@latest` (latest SDK, TypeScript), with dev builds through `expo-dev-client`; it doesn't work in Expo Go.
- [ ] Add `react-native-webrtc` with its config plugin, `react-native-sse`, and a QR component (`react-native-qrcode-svg`).
- [ ] Use Expo's monorepo support; check that Metro resolves the workspace packages.
- [ ] Use `sender-core` with an RN `createPeerConnection` and an SSE `EventStreamFactory`.
- [ ] Screens: Home (choose Local or Web, device name) → Sharing (code, QR, URL, viewers, stop). Use the **microphone as a temporary source** to prove the pipeline on a device.
- [ ] **Verify:** an Android dev build on a phone (Gradle on Linux or `eas build -p android --profile development`) sends mic audio in web mode to the receiver.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 16: Android system audio (Expo module, Kotlin) — spike first, then implement**
- [ ] Capture setup:
  - foreground service with `foregroundServiceType="mediaProjection"`, `FOREGROUND_SERVICE_MEDIA_PROJECTION` and `RECORD_AUDIO`
  - request the `MediaProjection` consent (Android 14+ asks every session)
  - `AudioRecord` built with `AudioPlaybackCaptureConfiguration`, covering usages MEDIA, GAME and UNKNOWN, at 48 kHz stereo PCM16
- [ ] Getting that audio into WebRTC. The spike decides which:
  1. **Primary:** in this module, set a custom `JavaAudioDeviceModule` (`setUseStereoInput(true)`) on `react-native-webrtc` through `WebRTCModuleOptions`. Use its audio-buffer callback to **replace** the mic buffer with the playback-capture PCM. This only works if the bundled WebRTC build has the callback.
  2. **Fallback:** switch to `@stream-io/react-native-webrtc`, which already has an Android screen-audio callback, and patch it to replace the mic audio instead of mixing it in.
- [ ] JS API: `SystemAudio.start(): Promise<MediaStreamTrack>` and `stop()`, plus an `onStopped` event (projection revoked).
- [ ] Note in the UI that Android shows a mic-in-use indicator, and that apps which opt out stay silent.
- [ ] **Verify:** YouTube or Spotify audio plays on a PC receiver in stereo, the stats panel shows about 128 kbps, and audio keeps going with the screen off for 10 minutes.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 17: Android local-server module (Kotlin) and bundling the receiver**
- [ ] Use NanoHTTPD on `0.0.0.0:47800`, or the next free port. It runs inside the same foreground service.
  - Serves the receiver bundle from `assets/receiver/`.
  - `/api/info` and `/api/ice-servers` are answered natively.
  - `/api/whep`: emit `{ requestId, method, query, body }` to JS → JS calls `handleLocalWhep` → `LocalServer.respond(requestId, status, headers, body)`. Native waits on a future with a 10 s timeout.
- [ ] Add a config plugin (`withDangerousMod`) that copies `apps/receiver/dist` into the Android assets at prebuild. Run it after the receiver build in turbo.
- [ ] Find LAN IPs from all up, non-loopback IPv4 interfaces, including hotspot `ap0` and `wlan`.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.
- [ ] **Milestone 3 demo:** a phone in **local** mode (or acting as a hotspot) sends system audio to a TV browser opening `http://<phone-ip>:47800/#k=…`.

### Phase 6 — iOS sender (ReplayKit) — needs a Mac/Xcode or EAS and an Apple Developer account

**Task 18: Spike — Broadcast Upload Extension with WebRTC**
- [ ] Build a standalone Xcode project first:
  - the extension links WebRTC iOS (the webrtc-sdk build through SPM)
  - it creates `RTCPeerConnectionFactory(audioDevice:)` with a custom `RTCAudioDevice`
  - it feeds `.audioApp` `CMSampleBuffer`s into that device, converted to 48 kHz with `AVAudioConverter`
  - it answers a hard-coded WHEP offer through the server
- [ ] Measure memory, which must stay under the 50 MB extension limit, and check audio quality and drift.
- [ ] **Go/no-go:** if the custom audio device isn't possible, fall back to an `RTCAudioTrack` built from an `RTCAudioSource` plus a patched capturer (as in Twilio's ReplayKit sample).
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.

**Task 19: iOS implementation (web mode only in the MVP)**
- [ ] Add the extension target with `@bacons/apple-targets` (a config plugin) and an App Group shared by the app and the extension.
- [ ] RN app:
  1. create the web session through `sender-core`
  2. write `{ sessionId, senderToken, iceServers, baseUrl }` to App Group defaults
  3. show the code and QR code
  4. launch `RPSystemBroadcastPickerView` (Expo module), set to the extension's bundle ID
- [ ] The extension, in Swift, ports the minimal answerer:
  - an SSE client over `URLSession` byte streams
  - SDP tuning (the same rules)
  - one `RTCPeerConnection` per viewer, POSTing the answers
  - status reported to the app through Darwin notifications and App Group state
- [ ] Local mode on iOS is deferred: background limits and the memory cap in the extension make it high risk.
- [ ] **Check:** typecheck 0 errors, lint 0 warnings, the build succeeds, and a local run where something runs.
- [ ] **Milestone 4 demo:** an iPhone sends Safari or Spotify audio to the TV browser through web mode.

### Phase 7 — Testing

All automated tests are written here, after development is complete. The items are grouped by the task they came from. Follow "Testing and data conventions" in AGENTS.md.

**Tests for Task 2: `packages/protocol` (Vitest)**
- [ ] Schema accept and reject cases, code alphabet and normalization, and `networkKey` for v4, v6 and mapped addresses.

**Tests for Task 3: `packages/sender-core` (Vitest, fake PC factory)**
- [ ] `tuneOpusSdp`: test against fixture SDPs from Chrome, Safari, Firefox and `react-native-webrtc`.
- [ ] Answer flow with a fake PC, viewer limit → `SESSION_FULL`, the transport handles an `offer` event by POSTing an answer, and a wrong local key → 401.

**Tests for Task 5: SessionRegistry and PendingOffers (Japa unit)**
- [ ] unique codes
- [ ] nearby matches the same `networkKey` and leaves out non-discoverable sessions
- [ ] the grace period expires, and resuming within it keeps the session
- [ ] pending offers time out and resolve exactly once

**Tests for Task 6: Sender endpoints and SSE (Japa functional)**
- [ ] Create → open SSE (read the raw stream in the test) → receive `ping`. A wrong token gets 401.

**Tests for Task 7: Receiver WHEP endpoints and discovery (Japa functional)**
- [ ] **Full relay test:** a fake sender opens the SSE stream, the test POSTs an offer as the receiver, the fake sender POSTs an answer, and the receiver gets 201 with that SDP. Also test: timeout → 504, and two clients from the same IP see each other in `nearby` while one from another IP doesn't.

**Tests for Task 8: ICE servers endpoint (Japa)**
- [ ] Default is STUN only, the HMAC verifies, and static credentials pass through.

**Tests for Task 9: `apps/receiver` (Vitest)**
- [ ] Endpoint resolution per mode and code parsing from the URL.

**Tests for Task 10: `apps/sender-web` (Vitest)**
- [ ] Audio capture handling: screen capture is requested with the planned settings, video tracks are stopped, a clear error shows when no audio was shared, and stopping the share in the browser is handled.
- [ ] Browser support check: Chrome and Edge are allowed; Firefox and Safari get the "unsupported" note.
- [ ] Local/Web mode switch: "Local" appears only when the host can run a local server (the Electron app); a plain browser shows "Web" only.
- [ ] Session screen state: Start sharing shows the code and the QR code for `${origin}/r/${code}`, the viewer list updates, the "Visible to nearby devices" toggle works, and Stop cleans everything up.

**Task 11: Playwright E2E for web mode**
- [ ] `webServer`: build everything, then start the server.
- [ ] Chromium runs with `--autoplay-policy=no-user-gesture-required`.
- [ ] Tests (they read audio stats through the receiver's test-mode stats hook from Task 9):
  1. sender-web with the test tone → a receiver opens `/r/<code>` → poll `getStats` until `inbound-rtp` audio shows `bytesReceived > 20_000` and `audioLevel > 0`
  2. a receiver in the same browser sees the session in Nearby and connects by clicking it
  3. two receivers both get audio
  4. a receiver reload reconnects within 10 s
  5. a wrong code shows an error

**Tests for Task 14: Electron (Playwright)**
- [ ] Playwright `_electron.launch`, using the test-tone source from Task 12:
  - local mode: open `http://127.0.0.1:47800/#k=<code>` in Chromium and assert received audio
  - web mode against a test server

**Tests for Task 15: `apps/sender-mobile` (Jest)**
- [ ] Jest tests for screen state logic.

**Tests for Task 19: iOS extension**
- [ ] SDP tuning: shared fixture tests, using the same fixtures as `tuneOpusSdp`.

- [ ] **Verify:** `npx turbo run typecheck lint test` passes, with no skipped tests.

### Phase 8 — Ship

**Task 20: Deployment, CI, docs**
- [ ] `deploy/Dockerfile`: multi-stage. Build the server, receiver and sender-web, and run on `node:26.13.1-slim`.
- [ ] `deploy/docker-compose.yml`:
  - `app`
  - `caddy` for automatic HTTPS
  - an optional `coturn` profile with `use-auth-secret`, a fixed relay port range, and `denied-peer-ip` for private ranges so the relay can't reach internal networks
- [ ] Add `.env.example`.
- [ ] `.github/workflows/ci.yml`:
  - Node 26.13, `npm ci`
  - commitlint on every commit in the PR: `npx commitlint --from origin/main --to HEAD --verbose`
  - `scripts/check_no_js.ts`
  - typecheck, lint, Vitest and Japa
  - Playwright web, then Playwright Electron under xvfb
  - `docker build`
  - optional Android `assembleDebug`
- [ ] README:
  - architecture
  - running each app
  - local versus web mode
  - environment variables
  - platform matrix
  - limitations: app opt-outs, DRM, iOS has web mode only, browser sender needs Chrome/Edge, system audio in the browser sender depends on the OS
- [ ] Before plan.md is deleted:
  - move the lasting conventions and decisions from plan.md into AGENTS.md and the README
  - update AGENTS.md's references to plan.md
  - confirm `grep -ri "plan.md" --exclude-dir=node_modules --exclude-dir=.git --exclude=plan.md .` finds nothing

### Phase 9 — Optional: PC bridge for apps that block capture (build last, not part of the MVP)

The phone plays to a PC as if it were a speaker, and the Electron sender streams that audio to receivers: phone → Bluetooth or AirPlay → PC → WebRTC → TV. Nothing needs installing on the phone. Costs: the PC must be on and nearby, and the link adds its own delay.

**Task 21: Spike on Windows — go/no-go for the whole phase**
- [ ] Build a small helper that calls `AudioPlaybackConnection`: `GetDeviceSelector()` with a `DeviceWatcher`, then `TryCreateFromId`, then start and open the connection. Keep a reference to the connection, because playback stops when it's released.
- [ ] Test with Android and iPhone, and record the results for each:
  - does Electron's loopback capture the Bluetooth audio?
  - does audio from an app that blocks capture come through? This is the point of the feature and is **unproven**.
  - how much delay does it add?
- [ ] Check whether `audio: 'loopbackWithMute'` stops the PC's own speakers playing along.
- [ ] Note that loopback also captures the PC's other sounds, such as notifications.
- [ ] **Stop here** if blocked apps stay silent, or if the delay makes it unusable.

**Task 22: Windows bridge mode**
- [ ] Bundle the helper in `extraResources` and talk to it from the Electron main process over stdio JSON.
- [ ] UI: "Use this PC as a Bluetooth speaker", a list of paired devices, connection status. Available in both local and web modes.

**Task 23: Linux bridge mode**
- [ ] Documented by WirePlumber: `a2dp_sink` is in the default `bluez5.roles`, and a phone's stream plays to the speakers by default (`bluez5.media-source-role = playback`). Setting that property to `input` exposes the phone to apps like a microphone.
- [ ] Prefer `input`: find the `bluez_input.*` device in `enumerateDevices()` and capture it through the input picker from Task 12. Fall back to the monitor source if the role stays `playback`.
- [ ] Don't change the user's audio config silently. Show the WirePlumber drop-in and explain it. Config syntax differs between 0.4 (Lua) and 0.5 (`wireplumber.conf.d`), so detect the version.
- [ ] Test on real hardware with both WirePlumber versions, since user reports show some setups need manual profile selection.

**Task 24: macOS bridge mode (iPhone and iPad only, through AirPlay)**
- [ ] No Bluetooth route: no supported way was found for a Mac to receive Bluetooth audio from a phone. Don't build one on the archived `A2DP-SINK` project.
- [ ] Test whether Electron's loopback captures audio from macOS AirPlay Receiver (macOS 12+, iOS 14+, same network). If it does, add setup instructions to the UI; no other code should be needed.
- [ ] Android phones have no route to a Mac. The UI should say so.

| Bridge PC | Phone link | Android phones | iPhones | Status |
|---|---|---|---|---|
| Windows 10 2004+ | Bluetooth | ✓ expected | ✓ expected | official API, needs the Task 21 test |
| Linux (PipeWire + WirePlumber) | Bluetooth | ✓ expected | ✓ expected | documented, needs a hardware test |
| macOS 12+ | AirPlay | ✗ | ✓ expected | capture of AirPlay audio untested |

## Platform matrix (target for the MVP)

| Sender | System audio | Local mode | Web mode |
|---|---|---|---|
| Android app (RN) | ✓ Android 10+ (apps that opt out are silent) | ✓ | ✓ |
| iOS app (RN + ReplayKit) | ✓ app audio (DRM silenced) | later | ✓ |
| Desktop app (Electron) | ✓ Windows, macOS 14.2+; Linux through a monitor source | ✓ | ✓ |
| Desktop browser (Chrome/Edge) | Windows/ChromeOS system audio; tab audio elsewhere | ✗ | ✓ |

Receivers: any browser with `RTCPeerConnection`, including Chromium-based smart-TV browsers.

## Risks and mitigations
- **Getting Android capture into WebRTC** (Task 16): the spike comes first, with a known fallback fork.
- **The iOS extension's memory and custom audio device** (Task 18): the spike is a go/no-go gate before any iOS UI work.
- **Discovery behind CGNAT or IPv6:** grouping by public IP can over-match (strangers on the same carrier NAT) or under-match. Sessions are listed only when `discoverable` is on, the toggle is visible, and code or QR always works.
- **Security:** in local mode, the code is the access key on `/api/whep`. In web mode, there are rate limits and short-lived codes. After the MVP, add an "Allow this receiver?" prompt on the sender.
- **The browser sender stops in a background tab or on a locked screen:** use Wake Lock and keep-the-tab-open hints. The native senders use a foreground service or the broadcast extension.

## Verification

This is the final verification, run after Phase 7. During development, each task uses the checks listed under "Tasks".
1. `npx turbo run typecheck lint test`: protocol and sender-core (Vitest), server (Japa unit and functional), receiver and sender-web (Vitest), mobile JS (Jest).
2. Conventions hold:
   - `node scripts/check_no_js.ts` passes
   - `npx commitlint --from origin/main --to HEAD` passes
   - every workspace `tsconfig.json` and `eslint.config.ts` extends the root files (`grep -L` finds none that don't)
3. `npx playwright test` in `apps/receiver`: the web-mode E2E tests from Task 11 (Phase 7). Electron E2E from Phase 7 in both modes.
4. The manual demos at each milestone (Milestones 1–4) above. Each records the stats panel showing the buffer (target under 150 ms on a LAN), bitrate, loss and stereo.
5. Internet check: the sender on mobile data and the receiver on home Wi-Fi. This works with STUN or shows a clear "relay needed" message, and works once `TURN_*` points at a coturn server.
