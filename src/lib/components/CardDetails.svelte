<script lang="ts">
    import type { Card } from '../stores/kanban';
    import { kanbanStore } from '../stores/kanban';
    import { Editor } from '@tiptap/core';
    import StarterKit from '@tiptap/starter-kit';
    import { Markdown } from 'tiptap-markdown';
    import { onMount, onDestroy } from 'svelte';
    import { ndkInstance } from '../ndk';

    export let card: Card;
    export let boardId: string;
    export let onClose: () => void;
    export let isUnmapped: boolean = false;

    let title = card.title;
    let status = card.status;
    let description = card.description;
    let newAttachment = '';
    let attachments = [...(card.attachments || [])];
    let newAssignee = '';
    let assignees = [...(card.assignees || [])];
    let editor: Editor;
    let editorElement: HTMLElement;
    let isSaving = false;
    let error: string | null = null;

    let currentUser: any = null;
    let loginMethod: string | null = null;

    onMount(() => {
        const unsubscribeNdk = ndkInstance.store.subscribe(state => {
            currentUser = state.user;
            loginMethod = state.loginMethod;
        });

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
            content: description,
            onUpdate: ({ editor }) => {
                description = editor.storage.markdown.getMarkdown();
            }
        });

        return {
            unsubscribeNdk
        }
    });

    onDestroy(() => {
        if (editor) {
            editor.destroy();
        }
    });

    $: canEditCard = currentUser && 
                 loginMethod !== 'readonly' && 
                 loginMethod !== 'npub' && 
                 currentUser.pubkey === card.pubkey;

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

    async function handleSave() {
        if (!title.trim()) return;
        
        try {
            isSaving = true;
            error = null;
            
            await kanbanStore.updateCard(boardId, {
                ...card,
                title: title.trim(),
                status: status.trim(),
                description: description.trim(),
                attachments,
                assignees
            });

            onClose();
        } catch (err) {
            console.error('Failed to save card:', err);
            error = err.message || 'Failed to save card';
        } finally {
            isSaving = false;
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
            <input 
                type="text" 
                class="title-input" 
                bind:value={title} 
                placeholder="Card Title"
            />
            <button class="close-btn" on:click={onClose}>&times;</button>
        </header>

        <div class="content">
            {#if error}
                <div class="error-message">
                    {error}
                </div>
            {/if}

            <div class="section">
                <label>Status</label>
                {#if isUnmapped}
                    <input 
                        type="text"
                        bind:value={status}
                        placeholder="Enter card status"
                    />
                    <div class="status-help">
                        This card's status doesn't match any column. You can edit it to match any of the column names.
                    </div>
                {:else}
                    <div class="status-display">
                        {status}
                    </div>
                {/if}
            </div>

            <div class="section">
                <label for="description">Description (Markdown supported)</label>
                <div class="editor-wrapper">
                    <div class="editor" bind:this={editorElement}></div>
                </div>
                <div class="editor-help">
                    Supports Markdown: **bold**, *italic*, # heading, - list, etc.
                </div>
            </div>

            <div class="section">
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
                {#if canEditCard}
                    <div class="add-assignee">
                        <input
                            bind:value={newAssignee}
                            placeholder="Enter nostr pubkey"
                            on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addAssignee())}
                        />
                        <button type="button" on:click={addAssignee}>Add Assignee</button>
                    </div>                   
                {/if}                
            </div>

            <div class="section">
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
                {#if canEditCard}
                <div class="add-attachment">
                    <input
                        bind:value={newAttachment}
                        placeholder="Enter link URL"
                        type="url"
                        on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttachment())}
                    />
                    <button type="button" on:click={addAttachment}>Add Link</button>
                </div>
                {/if}
            </div>
        </div>

        <footer>
            <button type="button" class="cancel" on:click={onClose}>
                Cancel
            </button>
            {#if canEditCard}
            <button 
                type="button" 
                class="save" 
                on:click={handleSave}
                disabled={isSaving}
            >
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            {/if}
        </footer>
    </div>
</div>

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
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #ddd;
        gap: 1rem;
    }

    .title-input {
        font-size: 1.5rem;
        font-weight: 500;
        border: none;
        padding: 0.25rem;
        flex-grow: 1;
        border-radius: 4px;
    }

    .title-input:hover {
        background: #f5f5f5;
    }

    .title-input:focus {
        background: white;
        outline: 2px solid #0052cc;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        padding: 0;
    }

    .content {
        flex-grow: 1;
        color: #333;
    }

    .section {
        margin-bottom: 1.5rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
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
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
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

    footer {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #ddd;
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

    .save {
        background: #0052cc;
        color: white;
    }

    button:hover {
        opacity: 0.9;
    }

    .error-message {
        background: #ffebee;
        color: #c62828;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }

    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
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
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
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

    .status-display {
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 4px;
        color: #666;
    }

    .status-help {
        font-size: 0.8rem;
        color: #666;
        margin-top: 0.5rem;
        font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
        .modal-backdrop {
            color: #333;
        }

        .title-input:hover {
            background: #050505;
        }

        .title-input:focus {
            background: #000000;
            outline: 2px solid #0052cc;
        }

        .board-header h2 {
            color: #eee;
        }

        .board-header p {
            color: #ccc;
        }        
    }
</style> 