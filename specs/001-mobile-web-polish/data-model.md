# Data Model: Mobile and Web Polish Pass

## Message (existing table `messages`)

| Field | Change | Notes |
|-------|--------|-------|
| `superseded_at` | NEW `timestamptz null` | Set when a later edit hides this message. Null means visible. |
| `content` | updated by edit | Only user messages; replaced in place. |

Index: `messages_visible_seq_idx on messages (conversation_id, seq) where superseded_at is null`.

**Rules**
- Only `role = 'user'` messages owned by the caller can be edited.
- An edit sets `superseded_at = now()` on every message in the same conversation with `seq > edited.seq` and
  `superseded_at is null`.
- Superseded messages are excluded from:
  - the message list and tail;
  - run context (lease bundle);
  - message search;
  - message context (deep links);
  - branch copy;
  - compaction coverage.
- Superseded rows are never deleted by this feature. Conversation deletion still removes them through the
  existing cleanup.
- RLS is unchanged: `owner_id` checks already cover the column.

## Run attempt (existing table `runs`)

No schema change. An edit creates a run for the edited user message with
`attempt = max(attempt) + 1`, status `queued`, and a new pending assistant message at `max(seq) + 1`
(including superseded rows, so `seq` stays unique).

## State transitions

```
user message:  visible --edit--> visible (new content)
later message: visible --edit of earlier message--> superseded (terminal)
run:           queued -> running -> completed | failed | cancelled   (unchanged)
```

## Client view model

- `visibleMessages`: the server list, already filtered for superseded rows. Runs of consecutive assistant
  messages collapse to the last one, so only the latest attempt is shown.
- The theme cache (SecureStore/localStorage `ai-chat.theme`) is unchanged.
