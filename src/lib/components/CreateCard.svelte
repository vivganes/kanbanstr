<script lang="ts">
    import type { Card } from '../stores/kanban';
    import { kanbanStore } from '../stores/kanban';
    import { Editor } from '@tiptap/core';
    import StarterKit from '@tiptap/starter-kit';
    import { Markdown } from 'tiptap-markdown';
    import { onMount, onDestroy } from 'svelte';
    import { ndkInstance } from '../ndk';
    import AlertModal from './AlertModal.svelte';

    export let onClose: () => void;
    export let columnName: string;
    export let boardId: string;
    export let cardsCount: number;

    let title = '';
    let description = '';
    let newAttachment = '';
    let attachments: string[] = [];
    let newAssignee = '';
    let assignees: string[] = [];
    let editor: Editor;
    let editorElement: HTMLElement;
    let errorMessage: string | null = null;

    onMount(() => {
        editor = new Editor({
            element: editorElement,
            extensions: [
                StarterKit,
                Markdown.configure({
                    html: false,
                    transformPastedText: true,
                    transformCopiedText: true
                })
            ],
            content: '',
            onUpdate: ({ editor }) => {
                description = editor.storage.markdown.getMarkdown();
            }
        });
    });

    onDestroy(() => {
        if (editor) {
            editor.destroy();
        }
    });

    function addAttachment() {
        if (newAttachment.trim()) {
            attachments = [...attachments, newAttachment.trim()];
            newAttachment = '';
        }
    }

    function removeAttachment(index: number) {
        attachments = attachments.filter((_, i) => i !== index);
    }

    function addAssignee() {
        if (newAssignee.trim() && !assignees.includes(newAssignee.trim())) {
            assignees = [...assignees, newAssignee.trim()];
            newAssignee = '';
        }
    }

    function removeAssignee(index: number) {
        assignees = assignees.filter((_, i) => i !== index);
    }

    async function handleSubmit() {
        if (!title.trim()) return;

        try {
            await kanbanStore.createCard(boardId, {
                title,
                description: description.trim(),
                status: columnName,
                order: cardsCount * 10,
                attachments,
                assignees
            });
            onClose();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to create card';
        }
    }

    // Function to format pubkey for display
    function formatPubkey(pubkey: string): string {
        return pubkey.slice(0, 8) + '...' + pubkey.slice(-8);
    }
</script>

<div class="modal-backdrop" on:click={onClose}>
    <div class="modal" on:click|stopPropagation>
        <header>
            <h2>Create New Card</h2>
            <button class="close-btn" on:click={onClose}>&times;</button>
        </header>

        <form on:submit|preventDefault={handleSubmit}>
            <div class="form-group">
                <label for="title">Title</label>
                <input
                    id="title"
                    bind:value={title}
                    placeholder="Enter card title"
                    required
                />
            </div>

            <div class="form-group">
                <label for="description">Description (Markdown supported)</label>
                <div class="editor-wrapper">
                    <div class="editor" bind:this={editorElement}></div>
                </div>
                <div class="editor-help">
                    Supports Markdown: **bold**, *italic*, # heading, - list, etc.
                </div>
            </div>

            <div class="form-group">
                <label>Assignees</label>
                <div class="assignees-list">
                    {#each assignees as assignee, i}
                        <div class="assignee-item">
                            <span>{formatPubkey(assignee)}</span>
                            <button type="button" class="remove-btn" on:click={() => removeAssignee(i)}>
                                &times;
                            </button>
                        </div>
                    {/each}
                </div>
                <div class="add-assignee">
                    <input
                        bind:value={newAssignee}
                        placeholder="Enter nostr pubkey"
                        on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addAssignee())}
                    />
                    <button type="button" on:click={addAssignee}>Add Assignee</button>
                </div>
            </div>

            <div class="form-group">
                <label>Attachments</label>
                <div class="attachments-list">
                    {#each attachments as attachment, i}
                        <div class="attachment-item">
                            <a href={attachment} target="_blank" rel="noopener noreferrer">{attachment}</a>
                            <button type="button" class="remove-btn" on:click={() => removeAttachment(i)}>
                                &times;
                            </button>
                        </div>
                    {/each}
                </div>
                <div class="add-attachment">
                    <input
                        bind:value={newAttachment}
                        placeholder="Enter link URL"
                        type="url"
                        on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttachment())}
                    />
                    <button type="button" on:click={addAttachment}>Add Link</button>
                </div>
            </div>

            <div class="actions">
                <button type="button" class="cancel" on:click={onClose}>
                    Cancel
                </button>
                <button type="submit" class="create">Create Card</button>
            </div>
        </form>
    </div>
</div>

{#if errorMessage}
    <AlertModal 
        message={errorMessage} 
        onClose={() => errorMessage = null} 
    />
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .modal {
        background: white;
        border-radius: 8px;
        padding: 1.5rem;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
    }

    h2 {
        margin: 0;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
    }

    .form-group {
        margin-bottom: 1rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
    }

    .editor-wrapper {
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
        text-align: left;
    }

    .editor {
        padding: 0.5rem;
        min-height: 100%;
    }

    .editor :global(*) {
        margin: 0;
    }

    .editor-help {
        font-size: 0.8rem;
        color: #666;
        margin-top: 0.5rem;
    }

    .attachments-list {
        margin-bottom: 0.5rem;
    }

    .attachment-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }

    .attachment-item a {
        color: #0052cc;
        text-decoration: none;
        word-break: break-all;
    }

    .attachment-item a:hover {
        text-decoration: underline;
    }

    .remove-btn {
        background: none;
        border: none;
        color: #ff4444;
        cursor: pointer;
        padding: 0 0.5rem;
    }

    .add-attachment {
        display: flex;
        gap: 0.5rem;
    }

    .add-attachment input {
        flex: 1;
    }

    .add-attachment button {
        white-space: nowrap;
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1.5rem;
    }

    button {
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        border: none;
    }

    .cancel {
        background: #f5f5f5;
        color: #333;
    }

    .create {
        background: #0052cc;
        color: white;
    }

    button:hover {
        opacity: 0.9;
    }

    .tiptap p{
        
    }

    .assignees-list {
        margin-bottom: 0.5rem;
    }

    .assignee-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        font-family: monospace;
    }

    .add-assignee {
        display: flex;
        gap: 0.5rem;
    }

    .add-assignee input {
        flex: 1;
    }

    .add-assignee button {
        white-space: nowrap;
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
</style> 