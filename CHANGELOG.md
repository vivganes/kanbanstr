# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

#### Threaded Comment Support (Nostr kind 30303)

- Cards now show a **Comments** section inside the card detail modal (`CardDetails.svelte`).
- Users can post top-level comments and nested threaded replies on any card they have write access to.
- Comments are published and loaded as Nostr events of kind `30303`, bound to a card via an `a` tag (`30302:<boardPubkey>:<cardDTag>`) and to their parent via an `e` tag.
- Read-only users (npub login or tracked boards) see existing comments but the compose and reply boxes are hidden.
- Optimistic updates: a posted comment appears immediately in the thread without requiring the modal to be closed and re-opened.
- New module `src/lib/stores/comments.ts` exports `COMMENT_KIND`, `Comment`, `CommentNode`, `buildThread`, `loadCommentsForCard`, and `publishComment`.
- New component `src/lib/components/CardComments.svelte` — self-contained top-level comments UI.
- New component `src/lib/components/CommentThread.svelte` — recursive threaded reply renderer via `<svelte:self>`.
- Board view, column view, and card summary tiles are visually unchanged.
- 42 new tests added (store unit tests, component characterization tests, integration tests); 48 tests pass in total, 0 failing.
