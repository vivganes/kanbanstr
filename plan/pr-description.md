# PR: Add threaded comment support (Nostr kind 30303)

## What this feature does (user-facing)

When a user opens a card's detail modal, a **Comments** section now appears below the
existing card fields. Users can:

- Read all existing threaded comments for that card, sorted oldest-first at each level.
- Post a new top-level comment via a compose textarea and "Post Comment" button.
- Click **Reply** on any existing comment to open an inline reply box and post a nested reply.
- See new comments appear immediately after posting (optimistic update) without closing and
  re-opening the modal.

Users in read-only mode (npub login, or viewing a tracked/foreign board) see the comment
thread but the compose and reply boxes are hidden.

The board view, column list, and card summary tiles are completely unchanged.

---

## Nostr event conventions used

### Kind: 30303 — card comment

```
kind: 30303
content: "<comment text>"
tags:
  ['a', '30302:<boardPubkey>:<cardDTag>']   -- binds comment to card
  ['e', '<cardEventId>', 'card']             -- top-level comment; references card event
```

### Kind: 30303 — reply to a comment

```
kind: 30303
content: "<reply text>"
tags:
  ['a', '30302:<boardPubkey>:<cardDTag>']   -- still bound to the same card
  ['e', '<parentCommentEventId>', 'reply']  -- references parent comment
```

### Load filter

```ts
{ kinds: [30303], '#a': ['30302:<boardPubkey>:<cardDTag>'] }
```

All comments for a card are fetched with a single relay query on modal open. There is no
continuous subscription; comments are fetch-once and then updated optimistically.

---

## Files changed and why

### New files

| File | Purpose |
|---|---|
| `src/lib/stores/comments.ts` | Exports `COMMENT_KIND=30303`, `Comment` and `CommentNode` interfaces, `buildThread` (pure threading function), `loadCommentsForCard` (fetch from relay), and `publishComment` (write to relay). Mirrors the pattern in `kanban.ts`. |
| `src/lib/components/CardComments.svelte` | Top-level comment UI: loads comments on mount, renders the thread tree, provides compose box. Props: `boardPubkey`, `boardId`, `card`, `readOnly`. |
| `src/lib/components/CommentThread.svelte` | Recursive reply renderer via `<svelte:self>`. Accepts a `CommentNode` and renders the comment plus indented child nodes. Includes a Reply button and inline reply compose box. |

### Modified files

| File | Change | Risk |
|---|---|---|
| `src/lib/components/CardDetails.svelte` | Added `import CardComments` and `<CardComments {boardPubkey} {boardId} {card} {readOnly} />` in a new section after Card Links. Additive only — no existing logic touched. | Low |
| `README.md` | Added threaded comments to the features list. | None |
| `CHANGELOG.md` | Created; added entry for this feature. | None |

### Test files added

| File | What it tests |
|---|---|
| `src/lib/stores/buildThread.test.ts` | 8 unit tests for the pure `buildThread` function: empty list, single root, nested replies, orphan promotion, sibling sort order, deep nesting. |
| `src/lib/components/CardDetails.pinning.test.ts` | 20 characterization tests for `CardDetails.svelte` verifying that existing behaviour (save button, read-only mode, assignees, attachments, cancel) is unchanged after the additive edit. |
| `src/test/comments.store.test.ts` | 14 integration tests for `loadCommentsForCard` and `publishComment` with `ndkInstance` mocked via `vi.mock`. Covers filter construction, event-to-Comment mapping, tag structure of published events, and optimistic Comment return value. |

---

## How to test manually

1. Log in with an nsec or NIP-07 extension (write access required).
2. Open any board and click a card to open the detail modal.
3. Scroll to the **Comments** section at the bottom of the modal.
4. Type a comment in the compose textarea and click **Post Comment**.
   - The comment should appear immediately in the thread.
5. Click **Reply** on the posted comment. Type a reply and click **Post Reply**.
   - The reply should appear indented below the parent comment.
6. Close and reopen the card modal — existing comments should be fetched from the relay
   and displayed.
7. Log in with an npub (read-only mode) and open a card — the compose and reply boxes
   should be absent; the thread should still be visible.
8. Open the board view after posting comments — columns and card tiles should look identical
   to before this change.

---

## Test coverage summary

All tests run with Vitest + jsdom + @testing-library/svelte.

| Test file | Tests | Result |
|---|---|---|
| `src/lib/stores/toast.test.ts` | 3 | pass |
| `src/lib/components/Toast.test.ts` | 3 | pass |
| `src/lib/stores/buildThread.test.ts` | 8 | pass |
| `src/lib/components/CardDetails.pinning.test.ts` | 20 | pass |
| `src/test/comments.store.test.ts` | 14 | pass |
| **Total** | **48** | **0 failing** |

Coverage for the new code (v8):

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `src/lib/stores/comments.ts` | 98 % | 65 % | 100 % | 98 % |
| `src/lib/components/CardComments.svelte` | 100 % | 60 % | 100 % | 100 % |
| `src/lib/components/CommentThread.svelte` | 100 % | 100 % | 100 % | 100 % |
| `src/lib/components/CardDetails.svelte` | 100 % | 67 % | 100 % | 100 % |

Branch gaps in `comments.ts` (lines 126-127) and `CardComments.svelte` (lines 106, 111,
142-145) correspond to the `ndk === null` early-return guard and the optimistic-reply
insert path, respectively. These are exercised by integration/manual testing but are
difficult to cover purely in unit tests without a relay.

---

## Screenshots / demo

_Replace these placeholders with actual screenshots before merging._

**Comment thread — light mode**
`[screenshot: card detail modal with a two-level comment thread, compose box visible]`

**Comment thread — dark mode**
`[screenshot: same modal in dark mode, correct dark-theme colours]`

**Read-only view**
`[screenshot: modal with npub login showing thread but no compose box]`

**Empty state**
`[screenshot: modal with no comments yet, placeholder text in compose box]`
