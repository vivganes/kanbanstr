# Seams and Dependencies — Threaded Comment Support (kind 30303)

## 1. Test Environment Baseline

The project uses **Vitest** with **jsdom** and **@testing-library/svelte**.
Two working test files exist as reference patterns:

- `src/lib/stores/toast.test.ts` — pure store unit test using `get()` and a factory function.
- `src/lib/components/Toast.test.ts` — Svelte component test using `render` / `fireEvent` / `screen` from `@testing-library/svelte`.

No test helpers, global fixtures, or mock factories exist yet.
Coverage is tracked via `@vitest/coverage-v8`.

---

## 2. Classes / Modules to Test

| Target | Type | Location (new) |
|---|---|---|
| `buildThread` | Pure function | `src/lib/stores/comments.ts` |
| `loadCommentsForCard` | Async function (NDK I/O) | `src/lib/stores/comments.ts` |
| `publishComment` | Async function (NDK I/O) | `src/lib/stores/comments.ts` |
| `CardComments.svelte` | Svelte component | `src/lib/components/CardComments.svelte` |
| `CardDetails.svelte` (additive) | Svelte component (existing) | `src/lib/components/CardDetails.svelte` |

---

## 3. Dependency Graph

```
comments.ts
├── ndkInstance          (imported from src/lib/ndk/index.ts — singleton)
│   ├── ndkInstance.ndk  (the raw NDK object — exposes .fetchEvents())
│   └── ndkInstance.publishEvent()
└── NDKEvent             (from @nostr-dev-kit/ndk — value object, constructable)

CardComments.svelte
├── loadCommentsForCard  (from comments.ts)
├── publishComment       (from comments.ts)
├── buildThread          (from comments.ts, pure)
├── getUserDisplayName   (from src/lib/utils/user)
├── UserAvatar           (Svelte component)
└── formatTimeAgo        (utility, assumed pure)

CardDetails.svelte (modified)
├── CardComments         (new import — added as child component)
├── kanbanStore          (existing)
├── ndkInstance          (existing)
└── [all existing dependencies unchanged]
```

---

## 4. Seams Identified

### 4.1 The critical seam: `ndkInstance` module import

`kanban.ts` calls `ndkInstance.ndk?.fetchEvents(...)` and `ndkInstance.publishEvent(event)`.
The new `comments.ts` will do the same.

`ndkInstance` is exported as a **module-level singleton** from `src/lib/ndk/index.ts`:

```ts
export const ndkInstance = NDKInstance.getInstance();
```

This is the primary seam. Vitest supports **vi.mock('path/to/module')** to replace the entire
module export. That is the injection point for all NDK-dependent tests.

The mock must satisfy two shapes:

```ts
// Mock for loadCommentsForCard
ndkInstance.ndk.fetchEvents(filter) => Promise<Set<NDKEvent>>

// Mock for publishComment
ndkInstance.publishEvent(event) => Promise<void>
```

`NDKInstance` also exposes `resetNdkInstance()` as a static method, but that is not needed
for test isolation — `vi.mock` replaces the import wholesale.

### 4.2 `buildThread` — a zero-dependency pure function (best seam)

`buildThread(comments: Comment[]): CommentNode[]` is a pure data-transformation function
with no I/O. It can be imported directly and tested with plain objects, no mocking required.
This is the **easiest and highest-confidence** test surface.

Test cases that can be written immediately:
- Empty array returns `[]`.
- A single root comment (parentType `'card'`) produces one root node with no replies.
- A reply (parentType `'reply'`) whose parentId matches a root comment is nested inside it.
- Orphaned replies (parentId points to a non-existent comment) are not silently swallowed
  (decide and document the chosen behavior).
- Siblings at the same level are sorted by `created_at` ascending.
- Deep nesting (reply to a reply) works correctly.

### 4.3 `loadCommentsForCard` — thin wrapper over NDK

The function's entire logic is:
1. Build the filter `{ kinds: [30303], '#a': ['30302:<boardPubkey>:<cardDTag>'] }`.
2. Call `ndk.fetchEvents(filter)`.
3. Map each `NDKEvent` to a `Comment` by extracting `id`, `pubkey`, `content`, `created_at`,
   and the first `e` tag's value and marker.

**Seam**: mock `ndkInstance.ndk.fetchEvents` to return a `Set<NDKEvent>` of hand-crafted
events. The mapping logic — which is the meaningful behavior — is then exercised without a
relay.

Test cases:
- Events with `['e', '<cardId>', 'card']` produce `Comment` with `parentType: 'card'` and `parentId: null`.
- Events with `['e', '<commentId>', 'reply']` produce `Comment` with `parentType: 'reply'`
  and `parentId: '<commentId>'`.
- Events with no `e` tag are handled gracefully (null / skipped).

### 4.4 `publishComment` — NDK write path

The function's logic is:
1. Construct an `NDKEvent` with `kind = 30303`.
2. Set `content`, add `['a', ...]` tag.
3. Add `['e', cardEventId, 'card']` (no parentCommentId) or `['e', parentCommentId, 'reply']`.
4. Call `ndkInstance.publishEvent(event)`.
5. Map the event to a `Comment` and return it.

**Seam**: mock `ndkInstance.publishEvent` with `vi.fn().mockResolvedValue(undefined)`.
Capture the `NDKEvent` passed to the mock and assert its `kind`, `content`, and `tags`.

Test cases:
- Top-level comment: `e` tag is `['e', cardEventId, 'card']`; no `p` tag.
- Reply: `e` tag is `['e', parentCommentId, 'reply']`.
- `a` tag is always `['a', '30302:<boardPubkey>:<cardDTag>']`.
- Returned `Comment` has `content`, `parentType`, and `parentId` set correctly.

### 4.5 `CardComments.svelte` — component seam

Props are the component's seam:
```ts
export let boardPubkey: string;
export let boardId: string;
export let card: Card;
export let readOnly: boolean;
```

`loadCommentsForCard` and `publishComment` are called inside the component via module
imports. They must be mocked at the module level (`vi.mock('../stores/comments')`).

`onMount` triggers `loadCommentsForCard`. The test runner (jsdom) runs lifecycle hooks,
so `render(CardComments, { props: {...} })` will call the mocked `loadCommentsForCard`.

Characterization tests to write before adding `<CardComments>` to `CardDetails.svelte`:
- With `readOnly: true`, the compose textarea and "Post Comment" button are absent from the DOM.
- With `readOnly: false`, the compose textarea is present.
- While `loading` is true (mock returns a never-resolving promise), a loading indicator
  is visible.
- When `loadCommentsForCard` rejects, an error message is rendered.
- A submitted comment text calls `publishComment` with the correct arguments and then
  clears the textarea.

### 4.6 `CardDetails.svelte` — characterization seam (before modification)

`CardDetails.svelte` is the only file being **modified** (not created from scratch).
Its `onMount` immediately:
1. Initialises a TipTap Editor (requires a real DOM element).
2. Calls `kanbanStore.loadMyBoards()` and `kanbanStore.loadMaintainingBoards()`.
3. Subscribes to `ndkInstance.store`.

**Testing CardDetails in isolation is difficult without mocking:**
- `kanbanStore` (module-level singleton, calls NDK internally).
- `ndkInstance` (module-level singleton, calls NDK and `localStorage`).
- `Editor` from TipTap (requires DOM, but jsdom is sufficient).
- `getContext('board')` — must be provided via a wrapping component or Svelte's
  `setContext` in the test.

The only behavior we are adding to `CardDetails.svelte` is:
```svelte
<CardComments {boardPubkey} {boardId} {card} {readOnly} />
```

Because this is purely additive and `CardComments` is itself a self-contained, testable
component, a characterization test for `CardDetails.svelte` only needs to assert that:
- The `CardComments` element is present in the rendered output after the change.

This is achievable by mocking `$lib/components/CardComments.svelte` (or the stores it uses)
and asserting the mock was rendered.

---

## 5. Testing Obstacles

### Obstacle 1: `ndkInstance` is a module-level singleton constructed at import time

`NDKInstance.getInstance()` is called at module load, which triggers `tryAutoLogin()`, which
accesses `localStorage`. In jsdom, `localStorage` exists, but `tryAutoLogin` will call
`this.loginReadOnly()` or other login paths that call `initNDK()`, which connects to real
relays.

**Mitigation**: Use `vi.mock('$lib/ndk/index.ts')` or the relative equivalent to replace
the entire module with a hand-written stub before any import of the module under test
resolves. This avoids the constructor side-effects entirely.

```ts
// In test file, before other imports:
vi.mock('../ndk', () => ({
    ndkInstance: {
        ndk: { fetchEvents: vi.fn() },
        publishEvent: vi.fn(),
        store: { subscribe: vi.fn(() => () => {}) },
        canWrite: vi.fn(() => true),
    }
}));
```

### Obstacle 2: `kanbanStore` is also a module-level singleton

`kanbanStore` calls `ndkInstance` internally. If `ndkInstance` is mocked, `kanbanStore` is
safe to leave unmocked for `comments.ts` tests — `comments.ts` does not import `kanbanStore`.
For `CardDetails.svelte` tests, `kanbanStore` must also be mocked.

### Obstacle 3: `NDKEvent` must be constructable in tests

`publishComment` will do `new NDKEvent(ndk)`. If `ndk` is a mock object, NDKEvent's
constructor may fail. Options:
- Pass a minimal mock NDK object `{}` — NDKEvent's constructor uses it only to set relay
  hints; it does not call relay methods during construction.
- Alternatively, intercept at the `ndkInstance.publishEvent` boundary and capture the
  event via the mock, avoiding direct NDKEvent construction in tests.

### Obstacle 4: `getContext('board')` in `CardDetails.svelte`

`CardDetails.svelte` calls `getContext('board')` in `onMount`. Tests that render
`CardDetails` must wrap it in a component that calls `setContext('board', mockBoard)`.
`@testing-library/svelte` supports this via wrapper components.

### Obstacle 5: TipTap `Editor` in `CardDetails.svelte`

TipTap's `Editor` calls `document.createElement` extensively. This works in jsdom but
requires the element reference (`bind:this={editorElement}`) to resolve before `onMount`
completes. In practice the existing `Toast.test.ts` pattern shows that jsdom + `render`
handles Svelte lifecycle correctly, so this should work without special handling.

---

## 6. Recommended Test Order

**Phase 1 — Zero mocking required**

Test `buildThread` in `src/lib/stores/comments.test.ts`.
This validates the core threading algorithm with plain data objects.

**Phase 2 — Thin NDK mock**

Test `loadCommentsForCard` and `publishComment` in the same file.
Mock `ndkInstance` at module level with `vi.mock`.
Assert filter construction and event-to-Comment mapping.

**Phase 3 — Component characterization (before CardDetails change)**

Write a snapshot or presence test for `CardDetails.svelte` in its current state to detect
unexpected regressions from the additive change. This requires mocking `kanbanStore`,
`ndkInstance`, and providing `getContext('board')`.

**Phase 4 — CardComments component tests**

Test `CardComments.svelte` in isolation by mocking `$lib/stores/comments` and providing
prop values. Assert loading state, error state, readOnly rendering, and submit behaviour.

**Phase 5 — Integration smoke test (optional)**

Render `CardDetails.svelte` with all dependencies mocked and assert that a
`data-testid="card-comments"` (or similar) attribute is present in the DOM after
`<CardComments>` is inserted.

---

## 7. Dependency Injection Points Summary

| Dependency | How it enters the code | Mock strategy |
|---|---|---|
| `ndkInstance.ndk.fetchEvents` | Module-level singleton import | `vi.mock('../ndk')` |
| `ndkInstance.publishEvent` | Module-level singleton import | `vi.mock('../ndk')` |
| `ndkInstance.store.subscribe` | Module-level singleton import | `vi.mock('../ndk')` |
| `kanbanStore` | Module-level singleton import | `vi.mock('../stores/kanban')` |
| `loadCommentsForCard` / `publishComment` | Module-level import inside CardComments | `vi.mock('../stores/comments')` |
| `getContext('board')` | Svelte context | Wrapper component in test |
| `Card` prop | Component prop | Pass plain object literal |
| `readOnly` prop | Component prop | Pass `true` / `false` directly |

---

## 8. What to Characterize in `CardDetails.svelte` Before Touching It

The additive change inserts exactly one line in the template:

```svelte
<CardComments {boardPubkey} {boardId} {card} {readOnly} />
```

Existing behavior that must not regress:
1. The save button calls `kanbanStore.updateCard` with the correct card fields.
2. The `readOnly` prop suppresses the save button and makes the editor non-editable.
3. The assignees list and attachment list render the data from the `card` prop.
4. `onClose` is called when the cancel button is clicked.

These are the characterization tests that should pass both before and after the additive
change, giving confidence that the template insertion has not broken existing sections.

---

## 9. Break Phase Verdict

**No structural changes to existing source code are required.**

### Reasoning

`ndkInstance` is exported as a plain ES module `const` from `src/lib/ndk/index.ts`:

```ts
export const ndkInstance = NDKInstance.getInstance();
```

`kanban.ts` (and the new `comments.ts`) imports it with a normal named import:

```ts
import { ndkInstance } from '../ndk';
```

Vitest's `vi.mock('path/to/module')` is hoisted above all imports in the test file and
replaces the entire module's export table before any module under test resolves. This
means that when a test file declares:

```ts
vi.mock('../ndk', () => ({
    ndkInstance: {
        ndk: { fetchEvents: vi.fn() },
        publishEvent: vi.fn(),
        store: { subscribe: vi.fn(() => () => {}) },
        canWrite: vi.fn(() => true),
    }
}));
```

...the singleton constructor (`NDKInstance.getInstance()`) is never called, so neither
the `localStorage` access in `tryAutoLogin()` nor the relay connections in `initNDK()`
are triggered during test runs.

### What was verified

1. Read `src/lib/ndk/index.ts` — confirmed the singleton is a bare module-level `const`.
2. Read `src/lib/stores/kanban.ts` — confirmed it uses a named import with no wrapper
   or indirection that would interfere with `vi.mock`.
3. Ran `npm test -- --run` — all 6 existing tests pass with no failures.

### Techniques not needed

- Parameterize Constructor: not needed; `vi.mock` replaces the whole module.
- Extract Interface: not needed; the mock object satisfies the duck-typed call sites.
- Introduce Static Setter: `resetNdkInstance()` already exists but is not needed for
  test isolation — `vi.mock` is the injection point.
- Any change to `src/lib/ndk/index.ts` or `src/lib/stores/kanban.ts`.

### Conclusion

The COVER step (writing tests) may proceed directly. The mock pattern documented in
section 5 (Obstacle 1) is immediately usable as-is against the unmodified source files.
