# Quickstart: Validate the Mobile and Web Polish Pass

## Prerequisites
- Node 26.13, pnpm 12.18, local Postgres `ai-chat-pg` at `127.0.0.1:54329`, and migrations applied
  (`pnpm migrate`).
- Xcode with an iOS 16.4+ simulator or device for native checks.
- Synthetic data only. Do not send real mail and do not use a production account for automated tests.

## Automated checks

```bash
pnpm typecheck
pnpm lint
pnpm test
DATABASE_URL=postgres://postgres@127.0.0.1:54329/ai_chat pnpm test:integration
pnpm test:e2e --reporter=list
```

Expected: all pass. The integration suite includes the edit cases from
[contracts/edit-message.md](./contracts/edit-message.md):
- owner isolation (404 for another owner);
- 409 while a run is active;
- later messages superseded and absent from the list, search, and context;
- idempotent replay returns one run;
- the run context excludes superseded turns.

## iOS build hygiene

```bash
cd apps/client && npx expo prebuild --platform ios --clean && npx expo run:ios
```

Count warnings in the newest `ios/build/Logs/Build/*.xcactivitylog`. Expected: at least 90% fewer than 242 (SC-006).
App-target warnings remain visible.

## Manual iOS pass (owner, on device)

| Spec | Check |
|------|-------|
| US4 / SC-001 | Theme ≠ system. Cold launch 10 times: no wrong-theme frame. |
| US3 / SC-002 | Ask for an image; it appears without leaving the chat. |
| US1 / SC-003 | Edit the first message of a 3-turn chat: same chat, later turns gone, new answer streams. |
| US2 | Send, edit open and cancel, copy, keyboard show and hide, drag to dismiss: smooth, no jumps, haptics. |
| US5 | The drawer covers the header; the brand row sits right under the status bar; drag tracks the finger. |
| SC-004 | During streaming in a long chat, scrolling stays smooth (Perf Monitor ≥ 55 fps). |
| Reduce Motion | Enable it in iOS Settings: transitions become instant or minimal. |

## Manual web pass (production after deploy, or local `pnpm dev:client`)

- Opening a chat does not animate every message.
- Copy shows a check in place, and nothing below moves.
- Messages scroll under a blurred header and a faded composer.
- The settings dialog fits its content; spacing between turns is even.
- Edit expands smoothly and focuses the end of the text.
