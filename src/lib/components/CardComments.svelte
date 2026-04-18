<script lang="ts">
    import { onMount } from 'svelte';
    import type { Card, CardComment } from '../stores/kanban';
    import { kanbanStore } from '../stores/kanban';
    import { ndkInstance } from '../ndk';
    import UserAvatar from './UserAvatar.svelte';
    import { formatTimeAgo } from '../utils/date';

    export let card: Card;
    export let boardPubkey: string;
    export let readOnly: boolean = false;

    let comments: CardComment[] = [];
    let newCommentText = '';
    let replyingTo: string | null = null;
    let replyText = '';
    let isSubmitting = false;
    let canComment = false;
    let isLoading = false;

    onMount(async () => {
        const unsubNdk = ndkInstance.store.subscribe(state => {
            canComment = !readOnly && (state.loginMethod === 'nsec' || state.loginMethod === 'nip07' || state.loginMethod === 'bunker');
        });

        isLoading = true;
        await kanbanStore.loadCommentsForCard(card, boardPubkey);
        isLoading = false;

        return () => unsubNdk();
    });

    const unsubKanban = kanbanStore.subscribe(state => {
        comments = state.comments.get(card.id) || [];
    });

    function getTopLevelComments(): CardComment[] {
        return comments.filter(c => c.parentId === null);
    }

    function getReplies(commentId: string): CardComment[] {
        return comments.filter(c => c.parentId === commentId);
    }

    async function submitComment() {
        if (!newCommentText.trim() || isSubmitting) return;
        isSubmitting = true;
        try {
            await kanbanStore.publishComment(card, boardPubkey, newCommentText.trim());
            newCommentText = '';
        } finally {
            isSubmitting = false;
        }
    }

    async function submitReply(parentId: string) {
        if (!replyText.trim() || isSubmitting) return;
        isSubmitting = true;
        try {
            await kanbanStore.publishComment(card, boardPubkey, replyText.trim(), parentId);
            replyText = '';
            replyingTo = null;
        } finally {
            isSubmitting = false;
        }
    }

    function toggleReply(commentId: string) {
        if (replyingTo === commentId) {
            replyingTo = null;
            replyText = '';
        } else {
            replyingTo = commentId;
            replyText = '';
        }
    }
</script>

<div class="comments-section">
    <label>Comments</label>

    {#if isLoading}
        <div class="loading-state">Loading comments...</div>
    {:else}
        <div class="comments-list">
            {#each getTopLevelComments() as comment (comment.id)}
                <div class="comment">
                    <div class="comment-header">
                        <UserAvatar pubkey={comment.pubkey} size={24} />
                        <span class="comment-meta">
                            <span class="comment-pubkey">{comment.pubkey.slice(0, 8)}…</span>
                            <span class="comment-time">{formatTimeAgo(comment.created_at)}</span>
                        </span>
                    </div>
                    <div class="comment-body">{comment.content}</div>
                    {#if canComment}
                        <button class="reply-toggle" type="button" on:click={() => toggleReply(comment.id)}>
                            {replyingTo === comment.id ? 'Cancel' : 'Reply'}
                        </button>
                    {/if}

                    {#if replyingTo === comment.id}
                        <div class="reply-input-row">
                            <textarea
                                bind:value={replyText}
                                placeholder="Write a reply…"
                                rows="2"
                                on:keydown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        submitReply(comment.id);
                                    }
                                }}
                            ></textarea>
                            <button
                                type="button"
                                class="submit-btn"
                                disabled={isSubmitting || !replyText.trim()}
                                on:click={() => submitReply(comment.id)}
                            >
                                {isSubmitting ? '…' : 'Reply'}
                            </button>
                        </div>
                    {/if}

                    {#each getReplies(comment.id) as reply (reply.id)}
                        <div class="comment reply">
                            <div class="comment-header">
                                <UserAvatar pubkey={reply.pubkey} size={20} />
                                <span class="comment-meta">
                                    <span class="comment-pubkey">{reply.pubkey.slice(0, 8)}…</span>
                                    <span class="comment-time">{formatTimeAgo(reply.created_at)}</span>
                                </span>
                            </div>
                            <div class="comment-body">{reply.content}</div>
                        </div>
                    {/each}
                </div>
            {/each}

            {#if comments.length === 0}
                <div class="no-comments">No comments yet.</div>
            {/if}
        </div>

        {#if canComment}
            <div class="new-comment-row">
                <textarea
                    bind:value={newCommentText}
                    placeholder="Write a comment… (Enter to submit, Shift+Enter for new line)"
                    rows="2"
                    on:keydown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitComment();
                        }
                    }}
                ></textarea>
                <button
                    type="button"
                    class="submit-btn"
                    disabled={isSubmitting || !newCommentText.trim()}
                    on:click={submitComment}
                >
                    {isSubmitting ? 'Posting…' : 'Post'}
                </button>
            </div>
        {/if}
    {/if}
</div>

<style>
    .comments-section {
        margin-bottom: 1.5rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    .loading-state,
    .no-comments {
        color: #666;
        font-size: 0.9rem;
        padding: 0.5rem 0;
    }

    .comments-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
    }

    .comment {
        background: #f5f5f5;
        border-radius: 6px;
        padding: 0.6rem 0.75rem;
    }

    .comment.reply {
        margin-top: 0.5rem;
        margin-left: 2rem;
        background: #ececec;
    }

    .comment-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.35rem;
    }

    .comment-meta {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }

    .comment-pubkey {
        font-size: 0.8rem;
        font-weight: 600;
        color: #333;
    }

    .comment-time {
        font-size: 0.75rem;
        color: #888;
    }

    .comment-body {
        font-size: 0.9rem;
        color: #333;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .reply-toggle {
        background: none;
        border: none;
        color: #0052cc;
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0.25rem 0;
        margin-top: 0.25rem;
    }

    .reply-toggle:hover {
        text-decoration: underline;
    }

    .reply-input-row,
    .new-comment-row {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
        align-items: flex-start;
    }

    .reply-input-row textarea,
    .new-comment-row textarea {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        resize: vertical;
        font-size: 0.9rem;
        font-family: inherit;
    }

    .submit-btn {
        white-space: nowrap;
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    @media (prefers-color-scheme: dark) {
        .comment {
            background: #2a2a2a;
        }

        .comment.reply {
            background: #222;
        }

        .comment-pubkey {
            color: #ddd;
        }

        .comment-body {
            color: #ccc;
        }

        .no-comments,
        .loading-state {
            color: #999;
        }

        .reply-input-row textarea,
        .new-comment-row textarea {
            background: #1a1a1a;
            color: #ddd;
            border-color: #444;
        }
    }
</style>
