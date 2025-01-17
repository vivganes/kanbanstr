NIP-100
======

Kanban Boards
------------

`draft` `optional`

This NIP defines a protocol for creating and managing Kanban boards on Nostr.

## Abstract

This NIP introduces event kinds and conventions for implementing Kanban boards, allowing users to create boards with multiple columns and cards that can be organized and tracked in a visual workflow.

## Motivation

Kanban boards are a popular project management tool that enables visual organization of tasks and workflows. Adding native Kanban support to Nostr allows for decentralized project management while maintaining the platform's permissionless and censorship-resistant nature.

## Specification

### Board Event 

```javascript
{
"created_at": 34324234234, //<Unix timestamp in seconds>
"kind": 30301,
"content": {
"description" : "Board Description", // can contain markdown too
"columnMapping": 'EXACT' //map the card's status exactly with column name - Extensible to different logics in future
"columns": [
{
"id": "col1",
"name": "To Do",
"order": 0
},
{
"id": "col2",
"name": "In Progress",
"order": 1
},
{
"id": "col3",
"name": "Done",
"order": 2
}
]
},
"tags": [
["d", "<board-d-identifier>"],
["title", "Board Name"],
// List of all cards in the board below
["a", "30302:<card-1-event-author-pubkey>:<card-1-d-identifier>", "<optional-relay-url>"],
["a", "30302:<card-2-event-author-pubkey>:<card-2-d-identifier>", "<optional-relay-url>"],
["a", "30302:<card-3-event-author-pubkey>:<card-3-d-identifier>", "<optional-relay-url>"],
],
// other fields...
}
```

### Card Event

```javascript
{
"created_at": 34324234234, //<Unix timestamp in seconds>
"kind": 30302,
"content": {
"status": "To do", // Match exactly with column name
"description": "Card description", //can contain markdown too
"order": 0, // auto-increment new card order in increments of 10 to provide space for rearranging to an extent
"attachments": [
    "https://example.com/file1.png",
    "https://example.com/file2.pdf"
]
},
"tags": [
["d", "<card-d-identifier>"],
["title", "Card Title"]
],
// other fields...
}
```

### Event Kinds

- 30301: Kanban Board Definition
- 30302: Kanban Card

### Required Tags

#### Board Events (kind: 30301)
- `d`: Unique identifier for the board
- `title`: Board name
- `a`: One for each card in the board

#### Card Events (kind: 30302)
- `d`: Unique identifier for the card
- `title`: Card title

### Access Control

1. Only the board creator can:
   - Modify board
   - Add a card to the board

2. Only the card creator can:
   - Modify cards (including the status)

3. Any user can:
   - View the board and cards
   - React, comment, zap on board and cards

### Client Behavior

Clients SHOULD:
- Display boards in a visual column layout
- Allow drag-and-drop card movement for authorized users
- Support board sharing via nostr: URI scheme
- Implement proper authorization checks before allowing modifications

Clients MAY:
- Implement additional features like card labels, due dates, or assignments
- Support board templates
- Provide filtering and search capabilities

## Security Considerations

1. Clients MUST verify event signatures and delegation tokens before allowing modifications
2. Relays MAY implement additional spam prevention measures

## Implementation Notes

To maintain a consistent board state:

1. Clients should handle concurrent updates by:
   - Using the event timestamp to resolve conflicts
   - Maintaining card order within columns

2. For performance, clients should:
   - Cache board and card data locally
   - Use efficient subscription filters when requesting updates

## Client-Relay Communication Example

```javascript
// Subscribe to the cards of a board
{
"kinds": [30302],
"#a": ["30302:<card-1-event-author-pubkey>:<card-1-d-identifier>","30302:<card-2-event-author-pubkey>:<card-2-d-identifier>",...]
}
```