# Incremental Streaming — Developer Note

## Purpose

We updated the board loading flow to stream board events from relays and update the UI incrementally as events arrive. This reduces the perceived loading time when many boards are present.

## New helper: `ndkInstance.streamEvents(filter, onEvent, onEose, options)`

- Tries to use the underlying NDK subscription API if available.
- Falls back to polling via `fetchEvents` if the subscription API isn't available.
- Options: { timeout?: number, pollInterval?: number, limit?: number }
- Returns: { cancel(): void } — call `cancel()` to stop streaming.

Example:

```ts
const streamer = ndkInstance.streamEvents(filter,
  (ev) => { /* handle each incoming NDKEvent */ },
  () => { /* called on EOSE / timeout */ },
  { timeout: 15000, pollInterval: 1000, limit: 200 }
);

// later
streamer.cancel();
```

## Usage in Kanban

- `kanbanStore.loadBoards()` now uses `streamEvents` and updates `boards`/`myBoards`/`maintainingBoards` incrementally as events arrive.
- Store fields:
  - `loading` — true initially until the first event arrives (or error occurs).
  - `streaming` — true while the stream is active (useful to show "Loading more…" messages).

## Notes

- The implementation dedupes boards by their `d` tag (or event id) using an internal Map and replaces the board entry when updated events arrive.
- We added cancellation when switching tabs and a timeout to end the polling fallback.
- Consider reusing `streamEvents` for other heavy fetches (cards, trackers) in the future.
