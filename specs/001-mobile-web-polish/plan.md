# Implementation Plan: Mobile and Web Polish Pass

**Branch**: `001-mobile-web-polish` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-mobile-web-polish/spec.md`

## Summary

This pass makes the chat smooth and native-feeling on iOS and web, fixes the defects from owner testing, and
replaces branch-on-edit with in-place editing (Gemini-style). On the client, motion moves to Reanimated on the
UI thread, rows are memoized, the floating header and composer use keyboard-synced positioning, a splash gate
covers launch, and a run-snapshot refresh brings in generated images. On the server, a soft "superseded" flag on
messages and a `POST /v1/messages/:id/edit` endpoint reuse the existing retry/attempt machinery.

## Technical Context

**Language/Version**: TypeScript 6.0 on Node 26.13 (API, worker), React 19.3, and React Native 0.88 (New Architecture, Fabric).

**Primary Dependencies**: Expo SDK 58, expo-router, TanStack Query 5, Fastify (API), pg-boss (worker),
react-native-gesture-handler 3.3. New: `react-native-reanimated@4.7.1`, `react-native-worklets@0.13.0`,
`react-native-keyboard-controller@1.22.7`, `expo-haptics@~58.0.7`, and `expo-splash-screen@~58.0.13` (versions from
Expo `bundledNativeModules.json`).

**Storage**: PostgreSQL (Supabase-hosted). New migration `0008_message_supersede.sql`.

**Testing**: Vitest unit tests (`pnpm test`), Vitest integration tests against local Postgres (`pnpm test:integration`), Playwright
e2e for desktop and mobile-web (`pnpm test:e2e`), Xcode build log for warnings, and a manual iOS device pass by the owner.

**Target Platform**: iOS 16.4+ (development build), modern desktop and mobile browsers (Expo web export).

**Project Type**: Mobile and web client (one Expo codebase) plus HTTP API and background worker (pnpm monorepo).

**Performance Goals**: At least 55 fps while scrolling during streaming in a 100-message thread. Only the streaming row re-renders
per delta. Keyboard and drawer motion run on the UI thread.

**Constraints**: Respect Reduce Motion. No content layout shift for copy, edit, or send. Production fails closed. No real
sends in tests. Web must keep working; native-only modules must no-op on web.

**Scale/Scope**: About 12 client files and 6 server files touched, one migration, one endpoint.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is an unfilled template, so the gates come from `AGENTS.md` (project law):

| Gate | Status |
|------|--------|
| Fixed stack (Expo, no extra apps, auth, or services) | PASS: only Expo-compatible native modules are added. |
| One model-driven agent; no new orchestration | PASS: no agent changes. |
| Validate provider and library APIs against official docs | PASS: versions come from Expo's bundled module list. Reanimated, keyboard-controller, and splash APIs are checked in research. |
| Production fails closed; no test doubles in production | PASS: edit uses the same key and run path as retry. |
| Spec conflicts are resolved before implementing | PASS: EXPANSION_SPEC "editing creates a branch" is superseded by the owner. The change is recorded in docs (ADR note) during implementation. |
| Evidence-based completion; PROGRESS updated | PLANNED: quickstart lists the commands and evidence. |
| No secrets or local paths committed | PASS. |
| New dependencies justified | PASS: the owner explicitly chose Reanimated, keyboard-controller, and haptics. The splash is required for FR-018. |

Post-design re-check: PASS. No violations, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-mobile-web-polish/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── edit-message.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/client/
├── app.json                      # plugins: expo-splash-screen, ./plugins/with-quiet-pods
├── babel.config.js               # NEW: babel-preset-expo (worklets plugin auto-added by preset)
├── package.json                  # new deps
├── plugins/with-quiet-pods.js    # NEW: suppress pod-target warnings
├── app/_layout.tsx               # splash gate, profile theme sync, KeyboardProvider, GestureHandlerRootView
└── src/
    ├── chat.tsx                  # floating header/composer, edit flow, list via MessageRow, drawer inset
    ├── message-row.tsx           # NEW: memoized row (bubble, edit box, actions, entering/layout)
    ├── message-actions.tsx       # copy morph, haptics, no notice line
    ├── markdown.tsx              # memoized parse
    ├── fool-spinner.tsx          # Reanimated skeleton/spinner, fade-in
    ├── attachment.tsx            # Reanimated photo skeleton
    ├── sidebar.tsx               # drawer: Gesture.Pan + shared values; mobile paddingTop
    ├── motion.ts                 # haptic helper; reduced-motion via Reanimated
    ├── use-run.ts                # refresh ['run', id] on tool.completed / terminal
    ├── settings-modal.tsx        # content-sized body
    └── web-effects.web.tsx       # drop per-message CSS enter; header blur; composer fade
apps/api/src/server.ts            # POST /v1/messages/:id/edit
apps/api/src/*.integration.test.ts
packages/contracts/src/schemas.ts # editMessageSchema
packages/database/src/repo.ts     # editMessage(); startAttempt() shared with retryMessage; list filter
packages/database/src/lease.ts    # context filter
packages/database/src/workspace.ts# search/context/branch/compaction filters
supabase/migrations/0008_message_supersede.sql
docs/API_CONTRACT.md, docs/EXPANSION_SPEC.md, docs/UX_SPEC.md, docs/PROGRESS.md
```

**Structure Decision**: Keep the existing monorepo layout. Add one client component file (`message-row.tsx`) and
one local Expo config plugin. No new packages in the workspace.

## Complexity Tracking

No violations.
