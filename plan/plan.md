# Implementation Plan: Threaded Comment Support (kind 30303)

## 1. Feature Description

Add threaded comment support to the card detail view. Comments are Nostr events of kind `30303`. Each comment references its parent card via an `a` tag and its parent comment (or card) via an `e` tag. Comments are only visible in the card detail modal (`CardDetails.svelte`) and never in the board or card summary view.

---

## 2. Nostr Event Structure

### Top-level comment on a card
```
kind: 30303
content: "<comment text>"
tags:
  ['a', '30302:<boardPubkey>:<cardDTag>']
  ['e', '<card-event-id>', 'card']
```

### Reply to an existing comment
```
kind: 30303
content: "<reply text>"
tags:
  ['a', '30302:<boardPubkey>:<cardDTag>']
  ['e', '<parent-comment-event-id>', 'reply']
  ['p', '<parent-comment-author-pubkey>']   (optional, per spec)
```

### Query to load all comments for a card
```
filter: {
  kinds: [30303],
  '#a': ['30302:<boardPubkey>:<cardDTag>']
}
```

---

## 3. Change Points

### 3.1 New file: `src/lib/stores/comments.ts`

This store mirrors the pattern in `kanban.ts`. Responsibilities:

- **`Comment` interface**
  - `id: string` — Nostr event id
  - `pubkey: string` — author's pubkey
  - `content: string` — comment text
  - `created_at: number` — Unix timestamp
  - `parentId: string | null` — id extracted from the `e` tag (`null` for card-root comments)
  - `parentType: 'card' | 'reply'` — from the `e` tag marker

- **`loadCommentsForCard(boardPubkey, cardDTag, cardEventId)`**
  - Fetches `kinds: [30303]` filtered by `#a: ['30302:<boardPubkey>:<cardDTag>']`
  - Maps each NDKEvent to a `Comment` by extracting `id`, `pubkey`, `content`, `created_at`, and the `e` tag.
  - Returns a flat `Comment[]` (threading is done in the component).

- **`publishComment(boardPubkey, cardDTag, cardEventId, commentText, parentCommentId?)`**
  - Creates an `NDKEvent` with `kind = 30303`
  - Sets `content = commentText`
  - Adds `['a', '30302:<boardPubkey>:<cardDTag>']`
  - If `parentCommentId` is provided: `['e', parentCommentId, 'reply']`; otherwise: `['e', cardEventId, 'card']`
  - Calls `ndkInstance.publishEvent(event)` (non-replaceable, since comments are immutable append-only events)
  - Returns the newly created `Comment` so the UI can add it optimistically

No local Svelte store state is needed for comments — the component fetches fresh on open and appends new comments locally to avoid a round-trip. This keeps the store lean.

---

### 3.2 New file: `src/lib/components/CardComments.svelte`

A self-contained component that accepts props:
- `boardPubkey: string`
- `boardId: string` — the board's `d` tag
- `card: Card` — the full card object (provides `card.id` for root `e` tag, `card.dTag` for `a` tag)
- `readOnly: boolean` — when true, hides the compose box

#### Internal structure

**Thread model** — built from the flat `Comment[]` after fetching:
```
interface CommentNode {
  comment: Comment;
  replies: CommentNode[];
}
```
A `buildThread(comments: Comment[]): CommentNode[]` pure function:
1. Puts all comments in a `Map<id, CommentNode>`.
2. Iterates: if `comment.parentType === 'card'`, push to root list; else push into parent's `replies`.
3. Sort each level by `created_at` ascending.

**State variables**
- `comments: Comment[]` — raw flat list from the store
- `loading: boolean`
- `error: string | null`
- `newCommentText: string` — bound to the top-level compose textarea
- `replyingToId: string | null` — id of the comment being replied to; drives which inline reply box is open
- `replyText: string` — text for the in-progress reply
- `isSubmitting: boolean`

**Lifecycle (`onMount`)**
- Calls `loadCommentsForCard` and populates `comments`.
- On destroy: no subscriptions to clean up (fetch-once pattern).

**Template layout (inside a `<div class="section">` matching CardDetails styling)**
```
<h3>Comments</h3>

{#if loading}  ... {/if}
{#if error}    ... {/if}

{#each rootNodes as node}
  <CommentThread {node} ... />
{/each}

{#if !readOnly}
  <div class="add-comment">
    <textarea bind:value={newCommentText} placeholder="Add a comment..." />
    <button disabled={!newCommentText.trim() || isSubmitting} on:click={submitComment}>
      Post Comment
    </button>
  </div>
{/if}
```

**`CommentThread` — inline recursive sub-template** (Svelte does not support recursive components trivially, so use a helper function that renders via `{#each}` or use a self-referential component with `<svelte:self>`).

Each comment node renders:
- `UserAvatar` (pubkey, size=24) + display name (via `getUserDisplayName`)
- `formatTimeAgo(comment.created_at)` timestamp
- Comment text paragraph
- "Reply" button (only when `!readOnly`) — sets `replyingToId = comment.id`
- If `replyingToId === comment.id`: an inline reply textarea + "Post Reply" / "Cancel" buttons
- `{#each node.replies as childNode}` — recursively renders child nodes (indented with CSS margin-left)

---

### 3.3 Modified file: `src/lib/components/CardDetails.svelte`

**Script changes:**
- Import `CardComments` from `./CardComments.svelte`
- No new props needed — `boardPubkey`, `boardId`, `card`, and `readOnly` are already available

**Template changes:**
- Add a new `<div class="section">` after the Card Links section (before the Clone to Board section), containing `<CardComments {boardPubkey} {boardId} {card} {readOnly} />`
- This ensures comments appear only inside the detail modal, leaving `Card.svelte` and `Column.svelte` completely untouched.

---

## 4. Impact Analysis

| File | Change type | Risk |
|---|---|---|
| `src/lib/stores/comments.ts` | New file | None — no existing code touched |
| `src/lib/components/CardComments.svelte` | New file | None — self-contained |
| `src/lib/components/CardDetails.svelte` | Additive edit — one import + one `<CardComments>` usage in template | Low |
| `src/lib/components/Card.svelte` | None | — |
| `src/lib/components/Column.svelte` | None | — |
| `src/lib/stores/kanban.ts` | None | — |
| `src/lib/ndk/index.ts` | None — `publishEvent` already exists | — |

The board view, card summary tiles, and all existing Nostr queries are unaffected.

---

## 5. Detailed Data Flow

### Opening card details
1. `Card.svelte` renders `<CardDetails>` when `showDetails = true`.
2. `CardDetails.svelte` renders `<CardComments boardPubkey card boardId readOnly>`.
3. `CardComments.svelte` `onMount` calls `loadCommentsForCard(boardPubkey, card.dTag, card.id)`.
4. `loadCommentsForCard` issues: `ndk.fetchEvents({ kinds: [30303], '#a': ['30302:<boardPubkey>:<cardDTag>'] })`
5. Events are mapped to `Comment[]` and stored in `comments`.
6. `buildThread(comments)` produces a `CommentNode[]` tree for rendering.

### Posting a top-level comment
1. User types in the compose textarea; `newCommentText` updates.
2. User clicks "Post Comment"; `submitComment()` called.
3. `publishComment(boardPubkey, card.dTag, card.id, newCommentText)` is called.
4. Event published: `kind=30303`, `content=text`, tags `['a', ...]` and `['e', card.id, 'card']`.
5. Returned `Comment` is appended to `comments`; `newCommentText` cleared.

### Posting a reply
1. User clicks "Reply" on a comment node; `replyingToId` set to that comment's id.
2. User types in inline reply box; `replyText` updates.
3. User clicks "Post Reply".
4. `publishComment(boardPubkey, card.dTag, card.id, replyText, parentComment.id)` called.
5. Event published with `['e', parentCommentId, 'reply']`.
6. Returned `Comment` appended to `comments`; reply box cleared and closed.

---

## 6. Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Card `id` (event id) used in `e` tag may differ from the in-memory `card.id` if the card was updated (kind 30302 is replaceable) | Medium | Use `card.id` as stored, which is the latest event id for that card. For replies this is informational — loading is always done via `#a` tag, not `#e`. |
| NDK may not index `#a` queries on all relays | Low | Same pattern as `loadCardsForBoard` which already uses `#a` filters. Works on Damus, nos.lol, Primal. |
| Users posting comments on read-only cards | Low | `readOnly` prop passed through; compose UI is hidden when `readOnly=true`. `canWrite()` is available on `ndkInstance` for an additional guard. |
| Infinite recursion in `CommentThread` rendering | Low | Use `<svelte:self>` with a depth limit (e.g., max 5 levels) or cap nesting visually after level 3 with continued indentation. |
| Performance: large number of comments fetched on open | Low | Comments are fetched once on modal open; no subscription needed. A simple loading state covers the fetch latency. |
| `card.id` not available (card loaded without it) | Very low | `Card` interface always carries `id: string` (set from `event.id` in `loadKanbanCardToBoard`). |

---

## 7. Success Criteria

1. Opening a card detail view triggers a single fetch of `kinds: [30303]` filtered by `#a: ['30302:<boardPubkey>:<cardDTag>']`.
2. Existing comments are displayed as a threaded list, sorted oldest-first within each level.
3. A logged-in (non-readonly, non-npub) user can type and submit a new top-level comment; a `30303` event is published with the correct `a` and `e` tags.
4. A user can click "Reply" on any displayed comment and post a reply; the reply event has `['e', '<parent-comment-id>', 'reply']`.
5. After posting, the new comment/reply appears immediately (optimistic update) without requiring a modal close/re-open.
6. The board view (`Board.svelte`, `Column.svelte`) and card summary tile (`Card.svelte`) are visually unchanged.
7. The `readOnly` prop suppresses the compose and reply UI — a user viewing a tracked card cannot post comments.

---

## 8. Styling Conventions to Follow

Based on the existing `CardDetails.svelte` style:
- Container: `<div class="section">` with `margin-bottom: 1.5rem`
- Comment items: similar to `.assignee-item` — `background: #f5f5f5`, `border-radius: 4px`, `padding: 0.5rem`
- Compose area: similar to `.add-attachment` pattern — flex row with textarea + button
- Reply indent: `margin-left: 1.5rem` per nesting level
- Buttons: `background: #0052cc; color: white; border-radius: 4px`
- Error/loading states: reuse `.error-message` class already in scope
- Dark mode: include `@media (prefers-color-scheme: dark)` blocks matching the existing modal's dark theme

---

## 9. File Locations

- `D:\source-codes\kanbanstr\src\lib\stores\comments.ts` — new store
- `D:\source-codes\kanbanstr\src\lib\components\CardComments.svelte` — new component
- `D:\source-codes\kanbanstr\src\lib\components\CardDetails.svelte` — modified (additive only)
- `D:\source-codes\kanbanstr\card-comments.md` — spec (read-only reference)
