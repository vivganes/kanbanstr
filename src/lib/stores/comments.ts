import { NDKEvent } from '@nostr-dev-kit/ndk';
import { ndkInstance } from '../ndk';

// ---------------------------------------------------------------------------
// Nostr kind and tag constants for the comment protocol
// ---------------------------------------------------------------------------

/** Nostr event kind for threaded card comments */
export const COMMENT_KIND = 30303;

/** Nostr event kind for kanban cards (used in the `a` tag reference) */
const CARD_KIND = 30302;

/** Marker used in the `e` tag when a comment references its parent card */
const E_TAG_MARKER_CARD = 'card';

/** Marker used in the `e` tag when a comment is a reply to another comment */
const E_TAG_MARKER_REPLY = 'reply';

// ---------------------------------------------------------------------------

export interface Comment {
    id: string;
    pubkey: string;
    content: string;
    created_at: number;
    parentId: string | null;      // from e tag value (null for card-root comments)
    parentType: 'card' | 'reply'; // from e tag marker
}

export interface CommentNode {
    comment: Comment;
    replies: CommentNode[];
}

/**
 * Pure function: builds a CommentNode tree from a flat Comment array.
 *
 * Rules:
 * - Comments with parentType === 'card' are root nodes.
 * - Comments with parentType === 'reply' are nested under the comment whose
 *   id matches their parentId.
 * - Orphan replies (parentId not found in the list) are promoted to root nodes.
 * - Siblings at every level are sorted by created_at ascending.
 */
export function buildThread(comments: Comment[]): CommentNode[] {
    // Build a node map keyed by comment id
    const nodeMap = new Map<string, CommentNode>();
    for (const comment of comments) {
        nodeMap.set(comment.id, { comment, replies: [] });
    }

    const roots: CommentNode[] = [];

    for (const comment of comments) {
        const node = nodeMap.get(comment.id)!;
        if (comment.parentType === E_TAG_MARKER_CARD) {
            roots.push(node);
        } else {
            // reply — find parent or fall back to root
            const parentNode = comment.parentId ? nodeMap.get(comment.parentId) : undefined;
            if (parentNode) {
                parentNode.replies.push(node);
            } else {
                // orphan reply — promote to root
                roots.push(node);
            }
        }
    }

    // Sort roots and all reply arrays by created_at ascending (recursive)
    function sortNodes(nodes: CommentNode[]): void {
        nodes.sort((a, b) => a.comment.created_at - b.comment.created_at);
        for (const node of nodes) {
            sortNodes(node.replies);
        }
    }

    sortNodes(roots);
    return roots;
}

/**
 * Maps an NDKEvent (kind 30303) to a Comment object.
 * Returns null if the event cannot be mapped.
 */
function ndkEventToComment(event: NDKEvent): Comment | null {
    const eTag = event.tags.find((t) => t[0] === 'e');
    if (!eTag) {
        // No e tag — treat as card-level comment with no parentId
        return {
            id: event.id ?? '',
            pubkey: event.pubkey ?? '',
            content: event.content ?? '',
            created_at: event.created_at ?? 0,
            parentId: null,
            parentType: E_TAG_MARKER_CARD,
        };
    }

    const isReply = eTag[2] === E_TAG_MARKER_REPLY;
    const parentType: 'card' | 'reply' = isReply ? E_TAG_MARKER_REPLY : E_TAG_MARKER_CARD;
    const parentId: string | null = isReply ? (eTag[1] ?? null) : null;

    return {
        id: event.id ?? '',
        pubkey: event.pubkey ?? '',
        content: event.content ?? '',
        created_at: event.created_at ?? 0,
        parentId,
        parentType,
    };
}

/**
 * Fetches all kind-30303 comments for a given card.
 *
 * Uses the #a filter: '30302:<boardPubkey>:<cardDTag>'
 */
export async function loadCommentsForCard(
    boardPubkey: string,
    cardDTag: string
): Promise<Comment[]> {
    const ndk = ndkInstance.ndk;
    if (!ndk) {
        return [];
    }

    const filter = {
        kinds: [COMMENT_KIND as any],
        '#a': [`${CARD_KIND}:${boardPubkey}:${cardDTag}`],
    };

    const events = await ndk.fetchEvents(filter);
    const comments: Comment[] = [];

    for (const event of events) {
        const comment = ndkEventToComment(event);
        if (comment) {
            comments.push(comment);
        }
    }

    return comments;
}

/**
 * Publishes a new kind-30303 comment event and returns the resulting Comment.
 *
 * If parentCommentId is provided, the comment is a reply to that comment;
 * otherwise it is a top-level comment on the card.
 */
export async function publishComment(
    boardPubkey: string,
    cardDTag: string,
    cardEventId: string,
    text: string,
    parentCommentId?: string
): Promise<Comment> {
    const ndk = ndkInstance.ndk;

    const event = new NDKEvent(ndk ?? undefined);
    event.kind = COMMENT_KIND;
    event.content = text;
    event.tags = [
        ['a', `${CARD_KIND}:${boardPubkey}:${cardDTag}`],
    ];

    if (parentCommentId) {
        event.tags.push(['e', parentCommentId, E_TAG_MARKER_REPLY]);
    } else {
        event.tags.push(['e', cardEventId, E_TAG_MARKER_CARD]);
    }

    await ndkInstance.publishEvent(event);

    const comment: Comment = {
        id: event.id ?? crypto.randomUUID(),
        pubkey: event.pubkey ?? '',
        content: text,
        created_at: event.created_at ?? Math.floor(Date.now() / 1000),
        parentId: parentCommentId ?? null,
        parentType: parentCommentId ? E_TAG_MARKER_REPLY : E_TAG_MARKER_CARD,
    };

    return comment;
}
