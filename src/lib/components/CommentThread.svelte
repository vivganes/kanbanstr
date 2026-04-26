<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { CommentNode } from '../stores/comments';
    import UserAvatar from './UserAvatar.svelte';
    import { getUserDisplayName } from '../utils/user';
    import { formatTimeAgo } from '../utils/date';

    export let node: CommentNode;
    export let readOnly: boolean = false;
    export let depth: number = 0;

    /** Passed down from parent so all nodes share the same reply-box state */
    export let replyingToId: string | null = null;
    export let replyText: string = '';
    export let isSubmitting: boolean = false;

    const dispatch = createEventDispatcher<{
        reply: { parentId: string; text: string };
        cancelReply: void;
        setReplyingTo: { id: string };
    }>();

    const MAX_VISUAL_DEPTH = 5;
    $: indent = Math.min(depth, MAX_VISUAL_DEPTH) * 1.25;

    function onReplyClick() {
        dispatch('setReplyingTo', { id: node.comment.id });
    }

    function onSubmitReply() {
        dispatch('reply', { parentId: node.comment.id, text: replyText });
    }

    function onCancelReply() {
        dispatch('cancelReply');
    }

    function handleReplyKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmitReply();
        }
    }
</script>

<div class="comment-wrapper" style="margin-left: {indent}rem">
    <div class="comment-item">
        <div class="comment-header">
            <UserAvatar pubkey={node.comment.pubkey} size={24} />
            <span class="comment-author">
                {#await getUserDisplayName(node.comment.pubkey)}
                    <span class="truncated-pubkey">{node.comment.pubkey.slice(0, 8)}...</span>
                {:then name}
                    <span>{name}</span>
                {:catch}
                    <span class="truncated-pubkey">{node.comment.pubkey.slice(0, 8)}...</span>
                {/await}
            </span>
            <span class="comment-time">{formatTimeAgo(node.comment.created_at)}</span>
        </div>
        <p class="comment-content">{node.comment.content}</p>
        {#if !readOnly}
            <button
                type="button"
                class="reply-btn"
                on:click={onReplyClick}
            >
                Reply
            </button>
        {/if}

        {#if replyingToId === node.comment.id}
            <div class="inline-reply">
                <textarea
                    bind:value={replyText}
                    placeholder="Write a reply... (Ctrl+Enter to submit)"
                    rows="2"
                    on:keydown={handleReplyKeydown}
                ></textarea>
                <div class="reply-actions">
                    <button
                        type="button"
                        class="post-reply-btn"
                        disabled={!replyText.trim() || isSubmitting}
                        on:click={onSubmitReply}
                    >
                        {isSubmitting ? 'Posting...' : 'Post Reply'}
                    </button>
                    <button
                        type="button"
                        class="cancel-btn"
                        on:click={onCancelReply}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        {/if}
    </div>

    {#if node.replies.length > 0}
        <div class="replies">
            {#each node.replies as childNode}
                <svelte:self
                    node={childNode}
                    readOnly={readOnly}
                    depth={depth + 1}
                    bind:replyingToId
                    bind:replyText
                    bind:isSubmitting
                    on:reply
                    on:cancelReply
                    on:setReplyingTo
                />
            {/each}
        </div>
    {/if}
</div>

<style>
    /* .comment-wrapper: margin-left is set inline per depth level */

    .comment-item {
        background: #f5f5f5;
        border-radius: 4px;
        padding: 0.5rem 0.75rem;
        margin-bottom: 0.5rem;
    }

    .comment-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
    }

    .comment-author {
        font-weight: 500;
        font-size: 0.875rem;
    }

    .truncated-pubkey {
        font-family: monospace;
        font-size: 0.8rem;
        color: #666;
    }

    .comment-time {
        font-size: 0.75rem;
        color: #888;
        margin-left: auto;
    }

    .comment-content {
        font-size: 0.875rem;
        color: #333;
        margin: 0.25rem 0 0.5rem;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .reply-btn {
        background: none;
        border: none;
        color: #0052cc;
        cursor: pointer;
        font-size: 0.8rem;
        padding: 0;
    }

    .reply-btn:hover {
        text-decoration: underline;
    }

    .inline-reply {
        margin-top: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .inline-reply textarea {
        width: 100%;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 0.4rem;
        font-size: 0.875rem;
        resize: vertical;
        box-sizing: border-box;
    }

    .inline-reply textarea:focus {
        outline: 2px solid #0052cc;
        border-color: #0052cc;
    }

    .reply-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
    }

    .post-reply-btn {
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.3rem 0.75rem;
        cursor: pointer;
        font-size: 0.8rem;
    }

    .post-reply-btn:disabled {
        background: #999;
        cursor: not-allowed;
    }

    .cancel-btn {
        background: none;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 0.3rem 0.75rem;
        cursor: pointer;
        font-size: 0.8rem;
    }

    /* .replies: child nodes are indented via the inline style on .comment-wrapper */

    @media (prefers-color-scheme: dark) {
        .comment-item {
            background: #2a2a2a;
        }

        .comment-content {
            color: #d0d0d0;
        }

        .truncated-pubkey {
            color: #aaa;
        }

        .comment-time {
            color: #888;
        }

        .reply-btn {
            color: #4d90fe;
        }

        .inline-reply textarea {
            background: #1e1e1e;
            color: #e0e0e0;
            border-color: #444;
        }

        .inline-reply textarea:focus {
            outline-color: #4d90fe;
            border-color: #4d90fe;
        }

        .cancel-btn {
            border-color: #555;
            color: #ccc;
        }
    }
</style>
