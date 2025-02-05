<script lang="ts">
    import type { Card, KanbanBoard } from '../stores/kanban';
    import { kanbanStore } from '../stores/kanban';
    import { Editor } from '@tiptap/core';
    import StarterKit from '@tiptap/starter-kit';
    import { Markdown } from 'tiptap-markdown';
    import { onMount, onDestroy, getContext } from 'svelte';
    import AlertModal from './AlertModal.svelte';
    import { getUserDisplayName, getUserDisplayNameByNip05, resolveIdentifier } from '../utils/user';

    export let onClose: () => void;
    export let columnName: string;
    export let aTagPointingToBoard: string;
    export let cardsCount: number;

    interface PossibleAssigneesListProps {
        pubkey: string;
        displayName: string;
    }

    let title = '';
    let description = '';
    let newAttachment = '';
    let attachments: string[] = [];
    let newAssignee = '';
    let assignees: string[] = [];
    let editor: Editor;
    let editorElement: HTMLElement;
    let errorMessage: string | null = null;
    let currentAssigneeDisplay: string | null = null;
    let isLoadingAssignee = false;
    let assigneeError: string | null = null;
    let board: KanbanBoard;
    let possibleAssignees: PossibleAssigneesListProps[] = [];
    let loadingPossibleAssignees = false;
    let errorLoadingPossibleAssignees: string | null = null;

    onMount(async() => {
        board = getContext('board');
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

        if (board) { 
            await loadPossibleAssignees();
        }
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


    async function validateAssignee(value: string) {
        if (!value.trim()) {
            currentAssigneeDisplay = null;
            isLoadingAssignee = false;
            assigneeError = null;
            return;
        }

        isLoadingAssignee = true;
        assigneeError = null;
        try {
            if (value.includes('@')) {
                currentAssigneeDisplay = await getUserDisplayNameByNip05(value.trim());
            } else {
                currentAssigneeDisplay = await getUserDisplayName(value.trim());
            }
        } catch (error) {
            currentAssigneeDisplay = null;
            assigneeError = "Invalid identifier";
        } finally {
            isLoadingAssignee = false;
        }
    }

    async function addAssignee() {
        if (newAssignee.trim()) {
            try {
                const hexPubkey = await resolveIdentifier(newAssignee.trim());
                if (assignees.includes(hexPubkey)) {
                    errorMessage = "This user is already assigned to the card";
                    setTimeout(() => errorMessage = null, 3000);
                    return;
                }
                assignees = [...assignees, hexPubkey];
                newAssignee = '';
                currentAssigneeDisplay = null;
            } catch (error) {
                console.error('Error in addAssignee:', error);
                errorMessage = "Invalid identifier or unable to fetch user profile";
                setTimeout(() => errorMessage = null, 3000);
            }
        }
    }

    function removeAssignee(index: number) {
        assignees = assignees.filter((_, i) => i !== index);
    }

    async function handleSubmit() {
        if (!title.trim()) return;

        try {
            await kanbanStore.createCard(aTagPointingToBoard, {
                title,
                description: description.trim(),
                status: columnName,
                order: cardsCount * 10,
                attachments,
                assignees,                
            });
            onClose();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to create card';
        }
    }

    async function loadPossibleAssignees() {
        loadingPossibleAssignees = true;
        errorLoadingPossibleAssignees = null;

        //add board owner as possible assignee
        possibleAssignees.push({ pubkey: board.pubkey, displayName: await getUserDisplayName(board.pubkey) });

        try {
            if(board.maintainers){
                for (const maintainerPubkey of board.maintainers){
                    if(board.pubkey !== maintainerPubkey){                    
                            try {
                                const displayName = await getUserDisplayName(maintainerPubkey);
                                possibleAssignees.push({ pubkey: maintainerPubkey, displayName: displayName });
                            } catch {
                                possibleAssignees.push({ pubkey: maintainerPubkey, displayName: "Anonymous" });
                            }
                        }

                }              
            }            
        } catch (error) {
            errorLoadingPossibleAssignees = error instanceof Error ? error.message : "Unknown error loading maintainers";
            console.error(errorLoadingPossibleAssignees);
        } finally {
            loadingPossibleAssignees = false;
        }
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
                    {#each [...new Set(assignees)] as assignee, i}
                        <div class="assignee-item">
                            {#await getUserDisplayName(assignee)}
                                <span>Loading...</span>
                            {:then name}
                                <span>{name}</span>
                            {:catch}
                                <span>Anonymous</span>
                            {/await}
                            <button type="button" class="remove-btn" on:click={() => removeAssignee(i)}>
                                &times;
                            </button>
                        </div>
                    {/each}
                    {#if assignees.length === 0}
                        <div>No assignees</div>
                    {/if}
                </div>
                <div class="add-assignee">
                    <div class="assignee-select-wrapper">
                        <select 
                            bind:value={newAssignee} 
                            disabled={loadingPossibleAssignees} 
                            on:change={() => validateAssignee(newAssignee)}
                            class="assignee-select-box">
                            <option  value="" disabled selected>Select Assignee</option>
                            {#if loadingPossibleAssignees}
                                <option value="">Loading available maintainers...</option>
                            {:else}
                                {#each possibleAssignees as maintainer}
                                    <option value={maintainer.pubkey}>{maintainer.displayName} ({maintainer.pubkey.slice(0,5)}:{maintainer.pubkey.slice(maintainer.pubkey.length-6, maintainer.pubkey.length-1)})</option>
                                {/each}
                            {/if}
                        </select>
                    </div>
                    <button 
                        type="button" 
                        on:click={() => addAssignee()}
                        disabled={!currentAssigneeDisplay}
                    >
                        Add
                    </button>
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
    }

    .assignee-select-wrapper {
        position: relative;
        flex: 1;
        margin-bottom: 1rem;
    }

    .assignee-select-box {
        width: 100%; 
        padding: 8px; 
        font-size: 14px; 
        border: 1px solid #ccc;
        border-radius: 4px; 
        background-color: #333;
    }

    .add-assignee {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        align-items: flex-start;
    }

    .add-assignee button {
        height: 36px;
        white-space: nowrap;
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .add-assignee button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .validation-feedback {
        position: absolute;
        top: 100%;
        left: 0;
        font-size: 0.8rem;
        margin-top: 4px;
        white-space: nowrap;
    }

    .validation-feedback.valid {
        color: #28a745;
    }

    .validation-feedback.error {
        color: #dc3545;
    }
</style> 