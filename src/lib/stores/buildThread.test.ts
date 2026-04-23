/**
 * Specification / TDD tests for the `buildThread` pure function.
 *
 * These tests are written BEFORE the function exists (TDD red phase).
 * They will fail until `buildThread` is exported from `./comments`.
 * They define the exact contract that the implementation must satisfy.
 *
 * `buildThread(comments: Comment[]): CommentNode[]`
 *   - Accepts a flat array of Comment objects.
 *   - Returns a tree of CommentNode objects where each node carries the
 *     original Comment and a `replies` array of child CommentNodes.
 *   - Root nodes are comments whose `parentType === 'card'`.
 *   - Reply nodes (parentType === 'reply') are nested inside their parent.
 *   - Orphan replies (parentId not found in the list) are treated as root nodes.
 *   - Siblings at every level are sorted by `created_at` ascending.
 */

import { describe, it, expect } from 'vitest';
import { buildThread } from './comments';
import type { Comment, CommentNode } from './comments';

// ---------------------------------------------------------------------------
// Helpers to build minimal Comment fixtures without importing NDK
// ---------------------------------------------------------------------------

function makeComment(overrides: Partial<Comment> & { id: string }): Comment {
    return {
        id: overrides.id,
        pubkey: overrides.pubkey ?? 'pubkey-' + overrides.id,
        content: overrides.content ?? 'content for ' + overrides.id,
        created_at: overrides.created_at ?? 1000,
        parentId: overrides.parentId ?? null,
        parentType: overrides.parentType ?? 'card',
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildThread', () => {
    it('returns an empty array when given no comments', () => {
        const result = buildThread([]);
        expect(result).toEqual([]);
    });

    it('returns a single root node with no replies for one top-level comment', () => {
        const comment = makeComment({ id: 'c1', parentType: 'card', parentId: null });

        const result = buildThread([comment]);

        expect(result).toHaveLength(1);
        expect(result[0].comment).toEqual(comment);
        expect(result[0].replies).toEqual([]);
    });

    it('nests a reply under its parent root comment', () => {
        const root = makeComment({ id: 'root', parentType: 'card', parentId: null, created_at: 1000 });
        const reply = makeComment({ id: 'reply1', parentType: 'reply', parentId: 'root', created_at: 2000 });

        const result = buildThread([root, reply]);

        expect(result).toHaveLength(1);
        expect(result[0].comment.id).toBe('root');
        expect(result[0].replies).toHaveLength(1);
        expect(result[0].replies[0].comment.id).toBe('reply1');
        expect(result[0].replies[0].replies).toEqual([]);
    });

    it('treats an orphan reply (parent not in list) as a root node', () => {
        // parentId points to a comment that does not exist in the input array
        const orphan = makeComment({
            id: 'orphan',
            parentType: 'reply',
            parentId: 'ghost-parent-that-does-not-exist',
            created_at: 1000,
        });

        const result = buildThread([orphan]);

        // The orphan must appear as a root-level node rather than being silently dropped
        expect(result).toHaveLength(1);
        expect(result[0].comment.id).toBe('orphan');
        expect(result[0].replies).toEqual([]);
    });

    it('sorts multiple root comments by created_at ascending', () => {
        const c1 = makeComment({ id: 'c1', parentType: 'card', parentId: null, created_at: 3000 });
        const c2 = makeComment({ id: 'c2', parentType: 'card', parentId: null, created_at: 1000 });
        const c3 = makeComment({ id: 'c3', parentType: 'card', parentId: null, created_at: 2000 });

        const result = buildThread([c1, c2, c3]);

        expect(result).toHaveLength(3);
        expect(result[0].comment.id).toBe('c2'); // created_at: 1000
        expect(result[1].comment.id).toBe('c3'); // created_at: 2000
        expect(result[2].comment.id).toBe('c1'); // created_at: 3000
    });

    it('sorts replies within a parent by created_at ascending', () => {
        const root = makeComment({ id: 'root', parentType: 'card', parentId: null, created_at: 1000 });
        const r1 = makeComment({ id: 'r1', parentType: 'reply', parentId: 'root', created_at: 5000 });
        const r2 = makeComment({ id: 'r2', parentType: 'reply', parentId: 'root', created_at: 2000 });
        const r3 = makeComment({ id: 'r3', parentType: 'reply', parentId: 'root', created_at: 3500 });

        const result = buildThread([root, r1, r2, r3]);

        expect(result).toHaveLength(1);
        const replies = result[0].replies;
        expect(replies).toHaveLength(3);
        expect(replies[0].comment.id).toBe('r2'); // created_at: 2000
        expect(replies[1].comment.id).toBe('r3'); // created_at: 3500
        expect(replies[2].comment.id).toBe('r1'); // created_at: 5000
    });

    it('handles deep nesting — a reply to a reply', () => {
        const root = makeComment({ id: 'root', parentType: 'card',  parentId: null,   created_at: 1000 });
        const child = makeComment({ id: 'child', parentType: 'reply', parentId: 'root',  created_at: 2000 });
        const grandchild = makeComment({ id: 'grand', parentType: 'reply', parentId: 'child', created_at: 3000 });

        const result = buildThread([root, child, grandchild]);

        expect(result).toHaveLength(1);

        const rootNode = result[0];
        expect(rootNode.comment.id).toBe('root');
        expect(rootNode.replies).toHaveLength(1);

        const childNode = rootNode.replies[0];
        expect(childNode.comment.id).toBe('child');
        expect(childNode.replies).toHaveLength(1);

        const grandchildNode = childNode.replies[0];
        expect(grandchildNode.comment.id).toBe('grand');
        expect(grandchildNode.replies).toEqual([]);
    });

    it('handles multiple root comments each with their own reply threads', () => {
        const rootA = makeComment({ id: 'A',    parentType: 'card',  parentId: null, created_at: 1000 });
        const replyA = makeComment({ id: 'A1',   parentType: 'reply', parentId: 'A',  created_at: 1500 });
        const rootB = makeComment({ id: 'B',    parentType: 'card',  parentId: null, created_at: 2000 });
        const replyB1 = makeComment({ id: 'B1',  parentType: 'reply', parentId: 'B',  created_at: 2500 });
        const replyB2 = makeComment({ id: 'B2',  parentType: 'reply', parentId: 'B',  created_at: 3000 });

        const result = buildThread([rootB, replyB2, rootA, replyA, replyB1]);

        expect(result).toHaveLength(2);
        expect(result[0].comment.id).toBe('A');
        expect(result[0].replies).toHaveLength(1);
        expect(result[0].replies[0].comment.id).toBe('A1');

        expect(result[1].comment.id).toBe('B');
        expect(result[1].replies).toHaveLength(2);
        expect(result[1].replies[0].comment.id).toBe('B1');
        expect(result[1].replies[1].comment.id).toBe('B2');
    });
});
