# Seams and Dependencies Map

## Scope of the Change

The plan introduces:
1. **`CardComment` interface** — pure data shape, no logic, no dependencies.
2. **`loadCommentsForCard()`** — fetches kind-30303 events from Nostr and maps them to `CardComment[]`.
3. **`publishComment()`** — builds a kind-30303 `NDKEvent` and publishes it via `ndkInstance.publishEvent()`.
4. **Comments UI** in `CardDetails.svelte` — calls the two store functions above.

---

## Classes / Modules to Test

| Unit | Location | What needs testing |
|---|---|---|
| `loadCommentsForCard` | `src/lib/stores/kanban.ts` | filter construction, event-to-`CardComment` mapping, sort order, `parentId`/`parentType` derivation |
| `publishComment` | `src/lib/stores/kanban.ts` | tag assembly (`a`, `e card`, `e reply`, `p`), correct call to `ndkInstance.publishEvent` |
| `CardDetails.svelte` (comments section) | `src/lib/components/CardDetails.svelte` | renders "Loading…", renders comment list, reply toggle, post actions call store functions |

---

## Dependency Graph

```
loadCommentsForCard
  └─ ndk.fetchEvents()          ← network I/O (relay call)
       └─ NDK instance          ← set via init(ndk) closure variable

publishComment
  ├─ new NDKEvent(ndk)          ← NDK instance
  ├─ event.tags.push(...)       ← pure manipulation
  └─ ndkInstance.publishEvent() ← module-level singleton (NDKInstance class)
         └─ event.publish()     ← relay call

CardDetails.svelte
  ├─ kanbanStore.loadCommentsForCard()
  ├─ kanbanStore.publishComment()
  └─ ndkInstance.store          ← to read currentUser
```

---

## Seams Identified

### Seam 1 — `init(ndk: NDK)` closure injection (STRONG SEAM ✅)

`createKanbanStore` captures `ndk` as a closure variable; calling `init()` replaces it.
In tests you can:
```ts
const store = createKanbanStore();
const mockNdk = { fetchEvents: vi.fn(), ... } as unknown as NDK;
store.init(mockNdk);
```
This covers `ndk.fetchEvents` inside both `loadCommentsForCard` and the `new NDKEvent(ndk)` constructor.

### Seam 2 — `ndkInstance` module import (WEAK SEAM ⚠️)

`publishComment` will call `ndkInstance.publishEvent(event)`.  
`ndkInstance` is imported at the **module level** from `'../ndk'` — it is a singleton instance, not a parameter.  
Vitest's `vi.mock('../ndk')` can stub the whole module, giving us control over `publishEvent`.

```ts
vi.mock('../../ndk', () => ({
  ndkInstance: { publishEvent: vi.fn() }
}));
```

### Seam 3 — `NDKEvent` constructor (INJECTABLE via mock NDK ✅)

`new NDKEvent(ndk)` uses the injected mock NDK from Seam 1.  
Provide a minimal mock that satisfies the `NDKEvent` constructor, or import the real `NDKEvent` from `@nostr-dev-kit/ndk` (it works without a live relay in unit tests since it only assigns fields).

### Seam 4 — Svelte component props (`CardDetails.svelte`) (INJECTABLE ✅)

`@testing-library/svelte` renders the component with props, so `boardPubkey`, `card`, `readOnly`, `currentUser` are all injectable at render time.  
Store calls can be mocked via `vi.mock` on the store module.

---

## Testing Obstacles

| Obstacle | Severity | Where |
|---|---|---|
| `ndk.fetchEvents` makes real relay calls | HIGH | `loadCommentsForCard` |
| `ndkInstance.publishEvent` is a singleton method | MEDIUM | `publishComment` |
| `NDKEvent` may attempt relay connection on construction | LOW | `publishComment` — only assignment, no IO at construction |
| `CardDetails.svelte` imports `kanbanStore` at module level | MEDIUM | component tests need module mock |
| `ndkInstance.store` is read for `currentUser` in the component | MEDIUM | component tests need store mock |

---

## What Makes the Store Functions Testable Right Now

`createKanbanStore` is **already exported as a factory** (the singleton `kanbanStore` is the only consumer, but tests can call `createKanbanStore()` directly).  
This means:
- We **can** instantiate a fresh store per test.
- We **can** inject a mock NDK via `init()`.
- We **cannot** avoid mocking `ndkInstance` for `publishComment` without module-level mocking.

The existing `toast.test.ts` follows exactly this factory pattern — it imports `createToastStore` (not the singleton) and calls it per test. The same approach works here.

---

## Recommended Testing Strategy

### Priority 1 — Store unit tests (`kanban.test.ts`)

**Why first**: Pure logic, no DOM, fast, already established pattern in the repo.

```
loadCommentsForCard
  ├─ returns [] when fetchEvents returns empty set
  ├─ maps event fields to CardComment correctly (id, pubkey, content, created_at)
  ├─ sets parentId=null, parentType='card' when e tag has marker 'card'
  ├─ sets parentId=<id>, parentType='reply' when e tag has marker 'reply'
  └─ returns results sorted by created_at ascending

publishComment (top-level)
  ├─ calls fetchEvents with correct #a filter
  ├─ adds ['a', '30302:<boardPubkey>:<cardDTag>'] tag
  ├─ adds ['e', cardEventId, 'card'] tag
  └─ calls ndkInstance.publishEvent once

publishComment (reply)
  ├─ adds ['e', parentCommentEventId, 'reply'] tag
  ├─ adds ['p', parentCommentAuthorPubkey] tag when provided
  └─ does NOT add ['e', ..., 'card'] tag
```

**How to instantiate**:
```ts
import { createKanbanStore } from './kanban';
import { vi } from 'vitest';

vi.mock('../ndk', () => ({
  ndkInstance: {
    publishEvent: vi.fn(),
    store: { subscribe: vi.fn() }
  }
}));

const mockNdk = {
  fetchEvents: vi.fn().mockResolvedValue(new Set()),
} as unknown as NDK;

const store = createKanbanStore();
store.init(mockNdk);
```

### Priority 2 — Component smoke tests (`CardDetails.test.ts`)

**Why second**: Validates UI wiring without full E2E. Already has `Toast.test.ts` as a pattern.

```
  ├─ renders "Loading comments…" while loadCommentsForCard is pending
  ├─ renders "No comments yet." when comments array is empty
  ├─ renders comment content and author avatar when comments are present
  ├─ reply button is hidden when readOnly=true
  └─ clicking "Post Comment" calls publishComment with correct args
```

Mock `kanbanStore` at module level so no real relay calls are made.

---

## Files to Create / Modify for Tests

| File | Action |
|---|---|
| `src/lib/stores/kanban.test.ts` | **Create** — store unit tests |
| `src/lib/components/CardDetails.test.ts` | **Create** — component tests |
| `src/lib/stores/kanban.ts` | **Modify** — export `createKanbanStore` so tests can call it directly |

> `createKanbanStore` is currently not exported. Adding `export function createKanbanStore()` (or exporting the factory) is the only source change needed to unlock testing, and it does not break any existing behavior.

---

## Next Step

Use `break.agent.md` to:
1. Export `createKanbanStore` from `kanban.ts`.
2. Decide whether `ndkInstance` calls inside `publishComment` should be extracted to a mockable helper or left to `vi.mock`.
