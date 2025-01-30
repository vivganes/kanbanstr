<script lang="ts">
    import type { Card } from '../stores/kanban';
    import { kanbanStore } from '../stores/kanban';
    import { Editor } from '@tiptap/core';
    import StarterKit from '@tiptap/starter-kit';
    import type { NDKKind } from '@nostr-dev-kit/ndk';
    import { Markdown } from 'tiptap-markdown';
    import { onMount, onDestroy } from 'svelte';
    import { ndkInstance } from '../ndk';
    import { getUserDisplayName, getUserDisplayNameByNip05, resolveIdentifier } from '../utils/user';
    import type { KanbanBoard } from '../stores/kanban';
    import { toastStore } from '../stores/toast';

    export let card: Card;
    export let boardId: string;
    export let onClose: () => void;
    export let isUnmapped: boolean = false;
    export let readOnly: boolean = false;


    let title = card.title;
    let status = card.status;
    let description = card.description;
    let newAttachment = '';
    let attachments = [...(card.attachments || [])];
    let newTag = '';
    let tTags = [...(card.tTags || [] )];
    let newAssignee = '';
    let assignees = [...new Set(card.assignees || [])];
    let editor: Editor;
    let editorElement: HTMLElement;
    let isSaving = false;
    let error: string | null = null;
    let currentUser: any = null;
    let loginMethod: string | null = null;
    let currentAssigneeDisplay: string | null = null;
    let isLoadingAssignee = false;
    let assigneeError: string | null = null;
    let showBoardSelector = false;
    let boardsICanCreateCardsIn: KanbanBoard[] = [];
    let selectedBoardId: string = '';
    let loadingBoards = true;
    let cloneSuccess = false;
    let isCloning = false;
    let selectedBoard: KanbanBoard | null = null; 
    let maintainers: string[] = [];
    let loadingMaintainers = false;
    let errorLoadingMaintainers: string | null = null;

    onMount(async () => {
        const unsubscribeNdk = ndkInstance.store.subscribe(state => {
            currentUser = state.user;
            loginMethod = state.loginMethod;
        });
        let unsubKanban = undefined;

        loadingBoards = true;
        try {
            if (boardsICanCreateCardsIn.length === 0) {
                await kanbanStore.loadMyBoards();
                await kanbanStore.loadMaintainingBoards();
            }
            
            unsubKanban = kanbanStore.subscribe(state => {
                boardsICanCreateCardsIn = [...(new Set([
                    ...state.myBoards,
                    ...state.maintainingBoards
                ]))]; //deduped boards from myBoards and maintainingBoards
                loadingBoards = false;
            });
        } catch (error) {
            console.error('Failed to load boards:', error);
            loadingBoards = false;
        }

        editor = new Editor({
            element: editorElement,
            editable: canEditCard,
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

        if (boardId) { 
            await loadBoardAndMaintainers(boardId);
        }
        updateAssignees();

        return () => {
                unsubscribeNdk();
                if(unsubKanban){
                    unsubKanban();
                }
                
        };
    });

    onDestroy(() => {
        if (editor) {
            editor.destroy();
        }
    });

    $: canEditCard = !readOnly;

    $: canEditCard, changeMarkdownEditability();

    function addAttachment() {
        if (newAttachment.trim()) {
            attachments = [...attachments, newAttachment.trim()];
            newAttachment = '';
        }
    }

    function removeAttachment(index: number) {
        attachments = attachments.filter((_, i) => i !== index);
    }

    function addTag() {
        if (newTag.trim() && !tTags.includes(newTag)) {
        tTags = [...tTags, newTag.trim()];
        newTag = '';
        }
    }

    function removeTag(index: number) {
        tTags = tTags.filter((_, i) => i !== index);
    }

    async function validateAssignee(value: string) {
        if (!value) {
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
                    error = "This user is already assigned to the card";
                    setTimeout(() => error = null, 3000);
                    return;
                }
                assignees = [...assignees, hexPubkey];
                newAssignee = '';
                currentAssigneeDisplay = null;
            } catch (error) {
                console.error('Error in addAssignee:', error);
                error = "Invalid identifier or unable to fetch user profile";
            }
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
                status: status?.trim(),
                description: description.trim(),
                attachments,
                tTags,
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

    async function handleCloneCard() {
        if (!selectedBoardId) return;
        try {
            isCloning = true;
            await kanbanStore.cloneCardToBoard(card, selectedBoardId);
            cloneSuccess = true;
            selectedBoardId = '';
            toastStore.addToast('Card cloned successfully');
            
            setTimeout(() => {
                cloneSuccess = false;
            }, 2000);
        } catch (error) {
            console.error('Failed to clone card:', error);
            toastStore.addToast('Failed to clone card', 'error');
        } finally {
            isCloning = false;
        }   
    }

    function changeMarkdownEditability() {
        if(editor){
            editor.setEditable(canEditCard);
        }
    }

    async function loadBoardAndMaintainers(boardId: string) {
        loadingMaintainers = true;
        errorLoadingMaintainers = null;
        try {
            const filter = {
                kinds: [30301 as NDKKind],
                '#d': [boardId]
            };
            const events = await ndkInstance.ndk?.fetchEvents(filter);
            if (!events || events.size === 0) {
                throw new Error("Board not found");
            }
            const boardEvent = Array.from(events)[0];
            selectedBoard = await kanbanStore.loadBoardByPubkeyAndId(boardEvent.pubkey, boardId); // Load full board details
            if (selectedBoard) {
                maintainers = selectedBoard.maintainers || [];
                console.log("Maintainers = ", maintainers);
            } else {
                errorLoadingMaintainers = "Board not found";
            }
        } catch (error) {
            errorLoadingMaintainers = error instanceof Error ? error.message : 'Error loading maintainers';
            console.error(errorLoadingMaintainers);
        } finally {
            loadingMaintainers = false;
        }
    }

    function updateAssignees() {
        let ownerNpub = card.pubkey;
        if (!assignees.includes(ownerNpub)) {
            assignees = [...assignees, ownerNpub];
        }
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

            {#if card.trackingKind === 30302 && card.trackingRef}
                <div class="info-message">
                    This card is just a tracker. It is originally present 
                    <a href={`${window.location.origin}/#/board/${card.trackingRef.boardATag.split(":")[1]}/${card.trackingRef.boardATag.split(":")[2]}/card/${card.trackingRef.cardDTag}`} 
                    target="_blank" 
                    rel="noopener noreferrer">here</a>.
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
                    {#each [...new Set(assignees)] as assignee, i}
                        <div class="assignee-item">
                            {#await getUserDisplayName(assignee)}
                                <span>Loading...</span>
                            {:then name}
                                <span>{name}</span>
                            {:catch}
                                <span>Anonymous</span>
                            {/await}

                            {#if assignee != card.pubkey}
                                <button type="button" class="remove-btn" on:click={() => removeAssignee(i)}>
                                    &times;
                                </button>
                            {/if}
                        </div>
                    {/each}
                    {#if assignees.length === 0}
                        <div>No assignees</div>
                    {/if}
                </div>
                {#if canEditCard}
                <div class="add-assignee">
                    <div class="assignee-select-wrapper">
                        <select 
                            bind:value={newAssignee} 
                            disabled={!canEditCard} 
                            on:change={() => validateAssignee(newAssignee)}
                            class="assignee-select-box"
                        >
                            <option  value="" disabled selected>Select Assignee</option>
                            {#each maintainers as maintainer}
                                <option value={maintainer}>{maintainer}</option>
                            {/each}
                        </select>
                        {#if isLoadingAssignee}
                            <div class="validation-feedback">Loading...</div>
                        {:else if currentAssigneeDisplay}
                            <div class="validation-feedback valid">✓ {currentAssigneeDisplay}</div>
                        {:else if assigneeError}
                            <div class="validation-feedback error">{assigneeError}</div>
                        {/if}
                    </div>
                    <button 
                        type="button" 
                        on:click={() => addAssignee()}
                        disabled={!canEditCard || !currentAssigneeDisplay}
                    >
                        Add
                    </button>
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
                    {#if attachments.length === 0}
                        <div>No attachments</div>
                    {/if}
                </div>
                {#if canEditCard}
                <div class="add-attachment">
                    <input
                        bind:value={newAttachment}
                        placeholder="Enter link URL"
                        disabled={!canEditCard}
                        type="url"
                        on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addAttachment())}
                    />
                    <button type="button" 
                    disabled={!canEditCard || !newAttachment.trim()}
                    on:click={addAttachment}>
                        Add Link
                    </button>
                </div>
                {/if}
            </div>

            <div class="section">
                <label>Tags</label>
                <div class="tag-list">
                    {#each tTags as tag, i}
                        <div class="tag-item">
                            {#if tTags.length > 0}
                                <p class="view-tag">{tag}</p>
                            {/if}
                            <button type="button" class="remove-btn" on:click={() => removeTag(i)}>
                                &times;
                            </button>
                        </div>
                    {/each}
                    {#if tTags.length === 0}
                        <div class="no-tags-text">No Tags</div>
                    {/if}
                </div>
                {#if canEditCard}
                <div class="add-attachment">
                    <input
                        bind:value={newTag}
                        placeholder="Enter Tags for this Card"
                        disabled={!canEditCard}
                        type="text"
                        on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    />
                    <button type="button" 
                    disabled={!canEditCard || !newTag.trim()}
                    on:click={addTag}>
                        Add Tag
                    </button>
                </div>
                {/if}
            </div>

            <div class="section">
                <label>Clone to Board</label>
                <div class="board-selector">
                    {#if loadingBoards}
                        <div class="loading-state">Loading boards...</div>
                    {:else if boardsICanCreateCardsIn.length === 0}
                        <div class="empty-state">No boards available</div>
                    {:else}
                        <select bind:value={selectedBoardId}>
                            <option value="">Select a board</option>
                            {#each boardsICanCreateCardsIn as board}
                                    <option value={board.id}>{board.title}</option>
                            {/each}
                        </select>
                        <button 
                            class="copy-button" 
                            disabled={!selectedBoardId || isCloning || cloneSuccess}
                            on:click={handleCloneCard}
                        >
                            {#if isCloning}
                                <span class="material-icons">hourglass_top</span>
                                Cloning...
                            {:else if cloneSuccess}
                                <span class="material-icons success-icon">check_circle</span>
                                Cloned
                            {:else}
                                Clone as new card
                            {/if}
                        </button>
                    {/if}
                </div>
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
                disabled={isSaving || !canEditCard}
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

    textarea{
        width: 100%;
        height: 50px;
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
        font-size: 1.2rem;
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

    .tag-list {
        width: auto;
        height: auto;
        color: #fff;
        display: flex;
        flex-wrap: wrap;
        margin-bottom: 0.5rem;
    }

    .tag-item {
        display: flex;
        justify-content: space-between;
        background-color: #666;
        min-width: 4rem;
        height: 2rem;
        margin-right: 5px;
        margin-bottom: 5px;
        padding: 2px 10px;
        border-radius: 5px;            
    }

    .view-tag {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .no-tags-text{
        color:#000000;
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

    .info-message {
        background: #ebf2ff;
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

    .validation-feedback.error {
        color: #dc3545;
    }

    .board-selector {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    select {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
    }

    .copy-button {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .success-icon {
        color: #2ecc71;
        font-size: 16px;
    }

    .empty-state {
        padding: 0.5rem;
        color: #666;
        font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
        select {
            background: #2d2d2d;
            color: white;
            border-color: #444;
        }

        .empty-state {
            color: #ccc;
        }
    }

    .loading-state {
        padding: 0.5rem;
        color: #666;
        font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
        .loading-state {
            color: #ccc;
        }
    }
</style> 