/**
 * Integration tests for loadCommentsForCard and publishComment in comments.ts.
 *
 * NDK is mocked at module level so no relays or localStorage are accessed.
 * The tests exercise the mapping logic, filter construction, and tag generation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Use vi.hoisted so that the mock factory can safely reference these variables
// even though vi.mock() is hoisted above all imports.
// ---------------------------------------------------------------------------

const { mockFetchEvents, mockPublishEvent } = vi.hoisted(() => {
    return {
        mockFetchEvents: vi.fn(),
        mockPublishEvent: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock('../lib/ndk', () => ({
    ndkInstance: {
        get ndk() {
            return { fetchEvents: mockFetchEvents };
        },
        publishEvent: mockPublishEvent,
        store: {
            subscribe: vi.fn((cb: (state: unknown) => void) => {
                cb({ user: null, loginMethod: null, isReady: false });
                return () => {};
            }),
        },
        canWrite: vi.fn(() => true),
    },
}));

import { loadCommentsForCard, publishComment } from '../lib/stores/comments';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal NDKEvent-like object that satisfies the mapping code in
 * comments.ts without needing a real NDK instance.
 */
function makeNdkEvent(overrides: {
    id?: string;
    pubkey?: string;
    content?: string;
    created_at?: number;
    tags?: string[][];
}) {
    return {
        id: overrides.id ?? 'event-id',
        pubkey: overrides.pubkey ?? 'some-pubkey',
        content: overrides.content ?? 'hello',
        created_at: overrides.created_at ?? 1700000000,
        tags: overrides.tags ?? [],
    };
}

// ---------------------------------------------------------------------------
// loadCommentsForCard tests
// ---------------------------------------------------------------------------

describe('loadCommentsForCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPublishEvent.mockResolvedValue(undefined);
    });

    it('calls fetchEvents with the correct #a filter', async () => {
        mockFetchEvents.mockResolvedValue(new Set());

        await loadCommentsForCard('board-pubkey', 'card-dtag');

        expect(mockFetchEvents).toHaveBeenCalledOnce();
        const [filter] = mockFetchEvents.mock.calls[0];
        expect(filter.kinds).toContain(30303);
        expect(filter['#a']).toEqual(['30302:board-pubkey:card-dtag']);
    });

    it('returns an empty array when no events are returned', async () => {
        mockFetchEvents.mockResolvedValue(new Set());

        const comments = await loadCommentsForCard('bp', 'cd');
        expect(comments).toEqual([]);
    });

    it('maps a card-level event (e tag marker "card") to a Comment with parentType card and parentId null', async () => {
        const event = makeNdkEvent({
            id: 'comment-1',
            pubkey: 'author-pk',
            content: 'Top level comment',
            created_at: 1700000001,
            tags: [
                ['a', '30302:board-pubkey:card-dtag'],
                ['e', 'card-event-id', 'card'],
            ],
        });
        mockFetchEvents.mockResolvedValue(new Set([event]));

        const comments = await loadCommentsForCard('board-pubkey', 'card-dtag');

        expect(comments).toHaveLength(1);
        expect(comments[0]).toMatchObject({
            id: 'comment-1',
            pubkey: 'author-pk',
            content: 'Top level comment',
            created_at: 1700000001,
            parentType: 'card',
            parentId: null,
        });
    });

    it('maps a reply event (e tag marker "reply") to a Comment with parentType reply and parentId set', async () => {
        const event = makeNdkEvent({
            id: 'reply-1',
            pubkey: 'replier-pk',
            content: 'A reply',
            created_at: 1700000002,
            tags: [
                ['a', '30302:board-pubkey:card-dtag'],
                ['e', 'comment-1', 'reply'],
            ],
        });
        mockFetchEvents.mockResolvedValue(new Set([event]));

        const comments = await loadCommentsForCard('board-pubkey', 'card-dtag');

        expect(comments).toHaveLength(1);
        expect(comments[0]).toMatchObject({
            id: 'reply-1',
            parentType: 'reply',
            parentId: 'comment-1',
        });
    });

    it('handles events with no e tag gracefully (treated as card-type with null parentId)', async () => {
        const event = makeNdkEvent({
            id: 'no-e-tag',
            tags: [['a', '30302:board-pubkey:card-dtag']],
        });
        mockFetchEvents.mockResolvedValue(new Set([event]));

        const comments = await loadCommentsForCard('board-pubkey', 'card-dtag');

        expect(comments).toHaveLength(1);
        expect(comments[0].parentType).toBe('card');
        expect(comments[0].parentId).toBeNull();
    });

    it('maps multiple events from the Set into multiple Comments', async () => {
        const event1 = makeNdkEvent({ id: 'c1', tags: [['e', 'card-id', 'card']] });
        const event2 = makeNdkEvent({ id: 'c2', tags: [['e', 'c1', 'reply']] });
        mockFetchEvents.mockResolvedValue(new Set([event1, event2]));

        const comments = await loadCommentsForCard('bp', 'cd');
        expect(comments).toHaveLength(2);
        const ids = comments.map((c) => c.id);
        expect(ids).toContain('c1');
        expect(ids).toContain('c2');
    });
});

// ---------------------------------------------------------------------------
// publishComment tests
// ---------------------------------------------------------------------------

describe('publishComment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPublishEvent.mockResolvedValue(undefined);
    });

    it('calls publishEvent once', async () => {
        await publishComment('board-pk', 'card-dtag', 'card-event-id', 'Hello world');
        expect(mockPublishEvent).toHaveBeenCalledOnce();
    });

    it('publishes a top-level comment with ["e", cardEventId, "card"] tag', async () => {
        await publishComment('board-pk', 'card-dtag', 'card-event-id', 'Top level');

        const [event] = mockPublishEvent.mock.calls[0];
        expect(event.kind).toBe(30303);
        expect(event.content).toBe('Top level');

        const eTag = event.tags.find((t: string[]) => t[0] === 'e');
        expect(eTag).toBeDefined();
        expect(eTag[1]).toBe('card-event-id');
        expect(eTag[2]).toBe('card');
    });

    it('includes the correct a tag for a top-level comment', async () => {
        await publishComment('board-pk', 'card-dtag', 'card-event-id', 'Comment text');

        const [event] = mockPublishEvent.mock.calls[0];
        const aTag = event.tags.find((t: string[]) => t[0] === 'a');
        expect(aTag).toBeDefined();
        expect(aTag[1]).toBe('30302:board-pk:card-dtag');
    });

    it('publishes a reply with ["e", parentCommentId, "reply"] tag', async () => {
        await publishComment('board-pk', 'card-dtag', 'card-event-id', 'A reply', 'parent-comment-id');

        const [event] = mockPublishEvent.mock.calls[0];
        const eTag = event.tags.find((t: string[]) => t[0] === 'e');
        expect(eTag).toBeDefined();
        expect(eTag[1]).toBe('parent-comment-id');
        expect(eTag[2]).toBe('reply');
    });

    it('returns a Comment with correct parentType "card" for a top-level comment', async () => {
        const comment = await publishComment('bp', 'cd', 'ceid', 'My comment');

        expect(comment.content).toBe('My comment');
        expect(comment.parentType).toBe('card');
        expect(comment.parentId).toBeNull();
    });

    it('returns a Comment with parentType "reply" and parentId set for a reply', async () => {
        const comment = await publishComment('bp', 'cd', 'ceid', 'My reply', 'parent-id');

        expect(comment.content).toBe('My reply');
        expect(comment.parentType).toBe('reply');
        expect(comment.parentId).toBe('parent-id');
    });

    it('sets event kind to 30303', async () => {
        await publishComment('bp', 'cd', 'ceid', 'text');
        const [event] = mockPublishEvent.mock.calls[0];
        expect(event.kind).toBe(30303);
    });

    it('a reply does NOT include the card event id in the e tag', async () => {
        await publishComment('bp', 'cd', 'card-event-id', 'reply text', 'parent-comment-id');

        const [event] = mockPublishEvent.mock.calls[0];
        const eTag = event.tags.find((t: string[]) => t[0] === 'e');
        // Should reference parent-comment-id, not card-event-id
        expect(eTag[1]).toBe('parent-comment-id');
        expect(eTag[1]).not.toBe('card-event-id');
    });
});
