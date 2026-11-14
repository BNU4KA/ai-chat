# Research: Mobile and Web Polish Pass

## R1. Launch theme flash
- **Decision**: Use `expo-splash-screen` with `preventAutoHideAsync()` at module scope in `app/_layout.tsx`. Call
  `hideAsync()` once the theme cache is read and auth is ready, and, if signed in, once the profile query has
  settled. A 3 s safety timer guarantees release. Apply `profile.theme` at the root.
- **Rationale**: The flash comes from the RN `Loading` overlay rendering system colors before the SecureStore
  read and before the profile is loaded. Holding the native splash hides every intermediate frame.
- **Alternatives**: A JS-only blank screen still shows the wrong color on the first frame. A synchronous MMKV
  cache would add a dependency and still need the profile for first-time devices.

## R2. Xcode warnings (242)
- **Decision**: Add a local config plugin using `withPodfile` that appends to `post_install`. For every pod
  target it sets `GCC_WARN_INHIBIT_ALL_WARNINGS=YES`, `SWIFT_SUPPRESS_WARNINGS=YES`, and
  `CLANG_WARN_DOCUMENTATION_COMMENTS=NO`.
- **Rationale**: The log analysis shows that 100% of the warnings come from pods (nullability, deprecations,
  unused functions in RN, RNSVG, gesture-handler, and expo modules). `ios/` is gitignored and regenerated
  by prebuild, so a direct Podfile edit would be lost.
- **Alternatives**: `inhibit_all_warnings!` in the Podfile has the same effect but needs the same plugin.
  `expo-build-properties` has no such option.

## R3. Image missing until re-entry
- **Decision**: In `use-run.ts`, invalidate `['run', runId]` on `tool.completed` and on terminal events.
- **Rationale**: `chat.tsx` replaces the list message with `snapshot.assistant_message`, whose `file_ids` are
  captured at run start. The worker links the generated file to the assistant message later.
- **Alternatives**: Merging `file_ids` from the list in the UI would leave the snapshot stale for other
  fields.

## R4. Motion stack
- **Decision**: Use Reanimated 4 for entering and layout transitions (`FadeInDown`, `LinearTransition`) and
  `LayoutAnimationConfig skipEntering` for the initial thread mount. The drawer uses Gesture Handler 3
  `Gesture.Pan` driving shared values. Skeletons and the spinner use `withRepeat`. Reduce Motion is handled with
  `ReduceMotion.System` and `useReducedMotion()`.
- **Rationale**: The owner chose Reanimated. The current `Animated` with `useNativeDriver: false` keyboard
  padding and the `PanResponder` drawer run on the JS thread and stutter during streaming. Reanimated 4 supports
  web, so the hand-written web FLIP and the CSS per-message animation can be deleted.
- **Alternatives**: Built-in `LayoutAnimation` is not available on web and is less controllable.
- **Note**: Reanimated 4 requires the New Architecture (enabled) and `react-native-worklets`. `babel-preset-expo`
  adds the worklets plugin automatically when the package is installed, so a `babel.config.js` is only created
  if verification shows the plugin is missing.

## R5. Keyboard
- **Decision**: Use `react-native-keyboard-controller`: `KeyboardProvider` at the root, `KeyboardStickyView` for the
  floating composer, and `KeyboardAwareScrollView`-equivalent bottom inset via `useReanimatedKeyboardAnimation`
  for the list. Interactive dismiss uses `KeyboardGestureArea` (iOS `interactive` mode).
- **Rationale**: The composer follows the keyboard frame by frame on the UI thread, which matches the native
  Messages app.
- **Alternatives**: `KeyboardAvoidingView` (RN) does not track the interactive dismiss gesture.

## R6. Render cost during streaming
- **Decision**: Extract `MessageRow` with `React.memo` and stable callbacks keyed by message id. Memoize
  markdown parsing per text in `markdown.tsx`. `StreamingMarkdown` ticks on `requestAnimationFrame` on native too.
- **Rationale**: Today every stream delta re-renders all rows and re-parses all markdown, and the 18 ms
  `setTimeout` tick adds more renders.
- **Alternatives**: FlashList v2 virtualization is deferred. With a 50-message page, memoization removes the
  hot path at a much smaller diff. Revisit if SC-004 fails.

## R7. Floating header and composer
- **Decision**: In chat mode the header and composer are absolutely positioned. The ScrollView gets top and bottom
  content insets equal to the measured header and composer heights. On web the header uses `backdrop-filter`
  blur and the composer has a gradient fade to the background. On native the header gets a translucent
  background and a hairline divider shown only when scrolled.
- **Rationale**: This removes the hard clipping strip the owner reported (item 5) and seen on production web.
- **Alternatives**: `expo-blur` would be one more native dependency for a marginal gain. Deferred.

## R8. Edit = regenerate in place
- **Decision**: Migration adds `messages.superseded_at timestamptz` and a partial index on
  `(conversation_id, seq) where superseded_at is null`. New `editMessage(owner, id, text, key, hash, meta)` runs
  in one transaction:
  1. Claim idempotency.
  2. Lock the conversation.
  3. Reject with 409 if a run is active.
  4. Set `superseded_at` on messages with `seq > m.seq`.
  5. Update `content`.
  6. Call the shared `startAttempt()` (extracted from `retryMessage`): new assistant message at `max(seq)+1` and a
     run with `attempt+1`.
  7. Write the outbox row.

  Reads filter `superseded_at is null` in message list and tail, lease context, `searchMessages`, message context,
  branch copy, and compaction.
- **Rationale**: Runs, usage, and spend reference messages, so hard deletion would break accounting. The runtime
  already skips older attempts of the current user message, so it needs only the superseded filter.
- **Alternatives**: Deleting the later turns breaks foreign keys and history. Keeping latest-only editing was
  rejected by the owner.
- **Client**: In `visibleMessages`, consecutive assistant messages collapse to the last one (retry
  replacement), as required by FR-006.

## R9. Copy feedback
- **Decision**: Remove the `notice` text. The icon crossfades `copy → check` for 1.5 s, the web tooltip hides on
  press, and a light haptic fires on iOS.
- **Rationale**: This removes the layout shift measured on production web.

## R10. Drawer layout
- **Decision**: Remove `topInset={52}` so the drawer covers the header. The mobile sidebar uses
  `paddingTop: 8`, because the root `SafeAreaView` already applies the top inset.
