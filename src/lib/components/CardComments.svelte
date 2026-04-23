<script lang="ts">
    import { onMount } from 'svelte';
    import type { Card } from '../stores/kanban';
    import { loadCommentsForCard, publishComment, buildThread } from '../stores/comments';
    import type { Comment } from '../stores/comments';
    import CommentThread from './CommentThread.svelte';

    export let boardPubkey: string;
    export let boardId: string;
    export let card: Card;
    export let readOnly: boolean = false;

    let comments: Comment[] = [];
    let loading = true;
    let error: string | null = null;
    let newCommentText = '';
    let replyingToId: string | null = null;
    let replyText = '';
    let isSubmitting = false;

    $: rootNodes = buildThread(comments);

    onMount(async () => {
        loading = true;
        error = null;
        try {
            comments = await loadCommentsForCard(boardPubkey, card.dTag);
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to load comments';
        } finally {
            loading = false;
        }
    });

    /**
     * Wraps a publish action with the shared isSubmitting guard and error
     * handling. The action receives the already-trimmed text and appends the
     * returned Comment to the local list on success.
     */
    async function withSubmit(
        text: string,
        failureMessage: string,
        action: (trimmed: string) => Promise<import('../stores/comments').Comment>
    ): Promise<boolean> {
        const trimmed = text.trim();
        if (!trimmed || isSubmitting) return false;
        isSubmitting = true;
        error = null;
        try {
            const comment = await action(trimmed);
            comments = [...comments, comment];
            return true;
        } catch (e) {
            error = e instanceof Error ? e.message : failureMessage;
            return false;
        } finally {
            isSubmitting = false;
        }
    }

    async function submitComment() {
        const posted = await withSubmit(
            newCommentText,
            'Failed to post comment',
            (trimmed) => publishComment(boardPubkey, card.dTag, card.id, trimmed)
        );
        if (posted) newCommentText = '';
    }

    async function handleReply(e: CustomEvent<{ parentId: string; text: string }>) {
        const { parentId, text } = e.detail;
        const posted = await withSubmit(
            text,
            'Failed to post reply',
            (trimmed) => publishComment(boardPubkey, card.dTag, card.id, trimmed, parentId)
        );
        if (posted) {
            replyText = '';
            replyingToId = null;
        }
    }

    function handleSetReplyingTo(e: CustomEvent<{ id: string }>) {
        replyingToId = e.detail.id;
        replyText = '';
    }

    function handleCancelReply() {
        replyingToId = null;
        replyText = '';
    }

    function handleCommentKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitComment();
        }
    }
</script>

<div class="section" data-testid="card-comments">
    <h3>Comments</h3>

    {#if loading}
        <div class="loading-state">Loading comments...</div>
    {:else if error}
        <div class="error-message">{error}</div>
    {/if}

    {#if !loading}
        {#if rootNodes.length === 0 && !error}
            <div class="empty-state">No comments yet.</div>
        {:else}
            <div class="comments-list">
                {#each rootNodes as node}
                    <CommentThread
                        {node}
                        {readOnly}
                        depth={0}
                        bind:replyingToId
                        bind:replyText
                        bind:isSubmitting
                        on:reply={handleReply}
                        on:cancelReply={handleCancelReply}
                        on:setReplyingTo={handleSetReplyingTo}
                    />
                {/each}
            </div>
        {/if}
    {/if}

    {#if !readOnly}
        <div class="add-comment">
            <textarea
                bind:value={newCommentText}
                placeholder="Add a comment... (Ctrl+Enter to submit)"
                rows="3"
                on:keydown={handleCommentKeydown}
            ></textarea>
            <button
                type="button"
                disabled={!newCommentText.trim() || isSubmitting}
                on:click={submitComment}
            >
                {isSubmitting ? 'Posting...' : 'Post Comment'}
            </button>
        </div>
    {/if}
</div>

<style>
    .section {
        margin-bottom: 1.5rem;
    }

    h3 {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
        color: #333;
    }

    .loading-state,
    .empty-state {
        color: #666;
        font-size: 0.9rem;
        padding: 0.5rem 0;
    }

    .error-message {
        background: #fff0f0;
        border: 1px solid #ffcccc;
        border-radius: 4px;
        color: #cc0000;
        padding: 0.5rem;
        font-size: 0.875rem;
        margin-bottom: 0.75rem;
    }

    .comments-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .add-comment {
        margin-top: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .add-comment textarea {
        width: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 0.5rem;
        font-size: 0.875rem;
        resize: vertical;
        box-sizing: border-box;
    }

    .add-comment textarea:focus {
        outline: 2px solid #0052cc;
        border-color: #0052cc;
    }

    .add-comment button {
        align-self: flex-end;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.4rem 1rem;
        cursor: pointer;
        font-size: 0.875rem;
    }

    .add-comment button:disabled {
        background: #999;
        cursor: not-allowed;
    }

    @media (prefers-color-scheme: dark) {
        h3 {
            color: #e0e0e0;
        }

        .loading-state,
        .empty-state {
            color: #aaa;
        }

        .error-message {
            background: #3a0000;
            border-color: #660000;
            color: #ff6666;
        }

        .add-comment textarea {
            background: #2a2a2a;
            color: #e0e0e0;
            border-color: #444;
        }

        .add-comment textarea:focus {
            outline-color: #4d90fe;
            border-color: #4d90fe;
        }
    }
</style>
