# Card Comments Feature Requirements

## Overview
Add threaded comment support for cards in the Kanban app, with comments visible only in the card detail view.  The look and feel should be consistent with the current look and feel in the app.

## User-facing behavior
- Users can add comments from a card detail view.
- Comments are displayed as a threaded list under the card details.
- Users can reply to an existing comment in the thread.
- Comments are stored in Nostr and loaded when the card detail is opened.
- No comment preview is required in the board/card summary view.

## Nostr event conventions
- Use a dedicated event kind for card comments, for example `30303`.
- Comment text is stored in the event `content` field, not in a tag.
- Each comment event must include an `e` tag referencing the parent card comment or the card itself.
  - For top-level comments on a card, use an `e` tag for the card reference:
    - `['e', '<card-event-id>', 'card']`
  - For replies, include an `e` tag referencing the parent comment event:
    - `['e', '<parent-comment-event-id>', 'reply']`
- Include a custom `a`-style app reference tag to bind the comment to the specific card:
  - `['a', '30302:<boardPubkey>:<cardDTag>']`
- Optional `p` tags may mention users in replies, in line with standard Nostr reply semantics.

## Data flow
- When opening card details, load comment events with:
  - `kinds: [30303]`
  - `#a: ['30302:<boardPubkey>:<cardDTag>']`
- Parse each comment event into a thread model using:
  - event `id`
  - event `pubkey`
  - event `content`
  - `created_at`
  - `e` tags for parent relationships
- Render top-level comments and nested replies based on `e` tag ancestry.

## Acceptance criteria
- Saving a new comment publishes a `30303` event with `content`, the card `a` tag, and the parent `e` tag.
- Replying to a comment publishes a `30303` event with the reply parent `e` tag.
- Opening card details loads comments by filtering on the card-specific `a` tag.
- Comments appear nested in the card detail UI.
- The board and card summary views remain unchanged; comments are only visible in card details.
