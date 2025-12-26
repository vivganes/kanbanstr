# Incremental Board Loading — Implementation Plan ✅

**Date:** 2025-12-26

## Summary

Goal: Stream board events from NDK and update the `boards` store incrementally so the UI shows boards as they arrive (no long all-or-nothing "Loading" wait).

Approach: Add a streaming helper on `ndkInstance`, then update `kanban.loadBoards` to process events as they arrive (dedupe by `d` tag), update store per-board, and stop on EOSE or timeout.

---

## Tasks

- [ ] Investigate NDK streaming/subscription API and confirm how to receive events incrementally.
- [ ] Design `ndkInstance.streamEvents(filter, onEvent, onEose, options)` helper that wraps NDK subscription.
- [ ] Implement streaming boards load in `kanban.loadBoards` using the streaming helper.
  - parse and validate each incoming event into a `KanbanBoard` object
  - dedupe by `d` tag (and event id) to avoid duplicates/replacements
  - update the store incrementally so UI renders per arrival
- [ ] Add cancellation/timeouts and robust error handling (stop subscription if user navigates away or a new load starts).
- [ ] Update `BoardsList.svelte` visuals to render boards as they arrive and show a progressive loading indicator until the first board arrives.
- [ ] Add tests and manual test steps to validate incremental rendering and subscription cleanup.
- [ ] Update docs and add a short developer note about streaming usage and migration from `fetchEvents`.

---

## Notes / Considerations

- Fallback behavior: if streaming fails, consider falling back to the current `fetchEvents` approach or surfacing an error to the user.
- Reuse: this streaming pattern can be applied later to other heavy requests (cards, trackers).
- Keep semantics: ensure replaceable/publishing semantics (based on `d` tags) remain consistent when new board events replace old ones.

---

## Next step

Investigate NDK's streaming API and create a thin `ndkInstance` helper to wrap subscriptions (so the rest of the app can remain simple and testable).

---

## Progress update (2025-12-26)

- Implemented `ndkInstance.streamEvents(...)` helper with subscribe detection and a polling fallback.
- Updated `kanban.loadBoards` to use streaming: it updates the store incrementally as events arrive, dedupes by `d` tag (keeps latest), and supports cancellation & timeout.
- Updated `BoardsList.svelte` to show boards as they arrive and display a small "Loading more boards…" note while streaming.

## Manual test steps

1. Start the app locally: `npm run dev`.
2. Log in (any method) and open the Boards list.
3. Observe the UI: it should show "Loading..." initially, then boards should appear one-by-one as they are received.
4. Open the Network panel (or use many boards on a relay) to verify partial renders while streaming.
5. Switch tabs while streaming to ensure the previous stream cancels and the new tab's stream starts.
6. Disconnect relays or simulate slow networks — the UI should not be blocked and will show the spinner/note until streaming ends or timeout happens.

If everything looks good, we'll add a short developer note and consider applying the same streaming pattern to other heavy requests (cards, tracked items).