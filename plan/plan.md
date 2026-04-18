# Plan: Card Comments Feature

## 1. Feature Description

Add threaded comment support for Kanban cards. Comments are visible **only** in the card detail view (`CardDetails.svelte`). Users can write top-level comments on a card and reply to existing comments. All comments are stored as Nostr events (kind `30303`) and loaded when card details are opened.

---

## 2. Nostr Event Schema

### Comment event (kind `30303`)
- `content`: the comment text
- `['a', '30302:<boardPubkey>:<cardDTag>']` — binds the comment to the specific card (used as the fetch filter)
- `['e', '<card-event-id>', 'card']` — for top-level comments; references the card event's `id`
- `['e', '<parent-comment-event-id>', 'reply']` — for replies; references the parent comment's event `id`
- Optional `['p', <pubkey>]` to mention the replied-to user

Comments are **regular** (not replaceable) events; use `event.publish()`, not `publishReplaceable()`.

---

## 3. Change Points

### A. New TypeScript interface — `src/lib/stores/kanban.ts`

Add a `CardComment` interface:
```ts
export interface CardComment {
  id: string;          // event id
  pubkey: string;      // author pubkey
  content: string;     // comment text
  created_at: number;  // unix timestamp
  parentId: string | null; // null = top-level card comment, string = reply to comment
  parentType: 'card' | 'reply'; // distinguishes card-level vs reply-level
}
```

### B. Two new store functions — `src/lib/stores/kanban.ts`

1. **`loadCommentsForCard(boardPubkey: string, cardDTag: string): Promise<CardComment[]>`**
   - Fetches `kinds: [30303]` filtered by `#a: ['30302:<boardPubkey>:<cardDTag>']`
   - Maps each event to `CardComment`, extracting the `e` tag to determine `parentId` and `parentType`
   - Returns the array sorted by `created_at` ascending

2. **`publishComment(boardPubkey: string, cardDTag: string, cardEventId: string, content: string, parentCommentEventId?: string, parentCommentAuthorPubkey?: string): Promise<void>`**
   - Creates a kind `30303` event
   - Sets `content` to the comment text
   - Adds `['a', '30302:<boardPubkey>:<cardDTag>']`
   - If `parentCommentEventId` is provided: adds `['e', parentCommentEventId, 'reply']` and optionally `['p', parentCommentAuthorPubkey]`
   - Otherwise: adds `['e', cardEventId, 'card']`
   - Calls `ndkInstance.publishEvent(event)` (no `publishReplaceable`)

### C. Comments UI section — `src/lib/components/CardDetails.svelte`

Add a **Comments** section at the bottom of the `.content` div (before the footer).

Script additions:
- State: `comments: CardComment[]`, `loadingComments: boolean`, `newCommentText: string`, `replyingToId: string | null`, `replyText: string`
- On mount: call `loadCommentsForCard(boardPubkey, card.dTag)` and populate `comments`
- `handlePostComment()` — calls `publishComment(...)` then reloads/appends to `comments`
- `handlePostReply(parentComment: CardComment)` — calls `publishComment(...)` with `parentCommentEventId`, then reloads/appends
- Helper `getReplies(parentId: string)` — filters `comments` to get direct children

Template additions (inside `.content` div, after Card Links section):
```
<div class="section">
  <h3>Comments</h3>
  {#if loadingComments}
    <div>Loading comments...</div>
  {:else}
    <!-- Top-level comments -->
    {#each topLevelComments as comment}
      <div class="comment">
        <div class="comment-header">
          <UserAvatar pubkey={comment.pubkey} />
          <span class="comment-author">{getUserDisplayName(comment.pubkey)}</span>
          <span class="comment-time">{formatDate(comment.created_at)}</span>
        </div>
        <div class="comment-body">{comment.content}</div>
        {#if currentUser && !readOnly}
          <button on:click={() => startReply(comment)}>Reply</button>
        {/if}
        <!-- Nested replies -->
        {#each getReplies(comment.id) as reply}
          <div class="comment comment-reply">
            ... same structure ...
          </div>
        {/each}
        {#if replyingToId === comment.id}
          <textarea bind:value={replyText} placeholder="Write a reply..." />
          <button on:click={() => handlePostReply(comment)}>Post Reply</button>
          <button on:click={cancelReply}>Cancel</button>
        {/if}
      </div>
    {/each}
    {#if comments.length === 0}
      <div>No comments yet.</div>
    {/if}
    <!-- New top-level comment input -->
    {#if currentUser && !readOnly}
      <div class="add-comment">
        <textarea bind:value={newCommentText} placeholder="Add a comment..." />
        <button disabled={!newCommentText.trim()} on:click={handlePostComment}>
          Post Comment
        </button>
      </div>
    {/if}
  {/if}
</div>
```

Style additions: `.comment`, `.comment-reply` (indented), `.comment-header`, `.comment-author`, `.comment-time`, `.comment-body`, `.add-comment` — consistent with existing card detail styles (background `#f5f5f5`, border-radius, padding).

---

## 4. Impact Analysis

| Area | Impact |
|------|--------|
| `kanban.ts` | Additive only — new interface + 2 new functions. No existing function changed. |
| `CardDetails.svelte` | New section in template + new script state/functions. Existing sections untouched. |
| `Board.svelte`, `Card.svelte`, `Column.svelte` | **No change** — comments are only in card detail view. |
| `NIP-100.md` | Should be updated to document kind `30303`. |

---

## 5. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Comment event published without login (no signer) | Low | `ndkInstance.publishEvent` already guards this; `readOnly` prop hides comment UI |
| Relay may not support `#a` tag filtering on kind 30303 | Medium | Most modern relays support NIP-12 tag filters; no special action needed |
| Comment load performance (many comments) | Low | Comments only loaded on demand when card details are opened |
| Thread depth — the spec only defines one level of nesting (reply to a comment) | N/A | Spec says reply to a comment; rendering is flat+one-level-indent |
| Concurrent reply state (replyingToId collides) | Low | Only one `replyingToId` tracked at a time; clicking another reply clears it |

---

## 6. Success Criteria

- [ ] Posting a comment creates a kind `30303` event with `content`, correct `a` tag, and `['e', cardEventId, 'card']`
- [ ] Posting a reply creates a kind `30303` event with `['e', parentCommentId, 'reply']`
- [ ] Opening card details loads existing comments via `#a` filter and renders them threaded
- [ ] Comments input is hidden when `readOnly=true` or user is not logged in
- [ ] Board view, card summary view, and column view are unchanged
- [ ] UI style is consistent with the rest of `CardDetails.svelte`

---

## 7. Files to Modify

1. `src/lib/stores/kanban.ts` — add `CardComment` interface, `loadCommentsForCard`, `publishComment`
2. `src/lib/components/CardDetails.svelte` — add comments section
3. `NIP-100.md` — document kind `30303` schema (optional but recommended)

## 8. Files NOT to Modify

- `src/lib/components/Card.svelte`
- `src/lib/components/Column.svelte`
- `src/lib/components/Board.svelte`
- `src/lib/components/BoardView.svelte`
- `src/lib/stores/toast.ts`, `donation.ts`, `contextMenu.ts`
- `src/lib/ndk/index.ts`

---

## Next Step

Use `map.agent.md` (step 2) to identify test seams and dependencies before implementing.
