<script lang="ts">
    import { getContext, onMount, setContext } from 'svelte';
    import type { KanbanBoard, Card } from '../stores/kanban';
    import Column from './Column.svelte';
    import { kanbanStore } from '../stores/kanban';
    import AlertModal from './AlertModal.svelte';
    import ConfirmModal from './ConfirmModal.svelte';
    import ReorderColumnsModal from './ReorderColumnsModal.svelte';
    import { ndkInstance } from '../ndk';
    import { push } from 'svelte-spa-router';
    import KanbanMigrationUtil from '../utils/MigrationUtilV1';
    import MaintainersList from './MaintainersList.svelte';
    import UserAvatar from './UserAvatar.svelte';
    import BoardSettings from './BoardSettings.svelte';
    import BoardFilters from './BoardFilters.svelte';

    export let board: KanbanBoard;
    export let initialCardToOpen: { dTag: string } | undefined = undefined;
    
    let cards: Card[] = [];
    let loading = true;
    let cardToOpen: Card | null = null;
    let showAddColumn = false;
    let newColumnName = '';
    let showAlert = false;
    let showConfirm = false;
    let alertMessage = '';
    let confirmMessage = '';
    let pendingColumnDelete: string | null = null;
    let showReorderColumns = false;
    let errorMessage: string | null = null;
    let currentUser: any = null;
    let loginMethod: string | null = null;
    let needsMigration:boolean = board.needsMigration || false;
    let isEditingDetails = false;
    let editedTitle = '';
    let editedDescription = '';
    let editedMaintainers: string[] = [];
    let showFilters = false;
    let filteredCards = cards;
    let isFilterActive = false;
    
    let boardFilters = {
        states: [],
        assignees: [],
        tags: [],
        searchText: ''
    };

    onMount(() => {

        if(board){
            setContext('board', board);
        }
        const ndkUnsubscribe = ndkInstance.store.subscribe(state => {
            currentUser = state.user;
            loginMethod = state.loginMethod;
        });

        const boardSub = kanbanStore.subscribe(state => {
            const boardState = state.boards;
            const boardWithCurrentID = boardState.find(b => b.id === board.id);        
            if (boardWithCurrentID) {
                board = boardWithCurrentID;
                if(board.needsMigration){
                    needsMigration = true;
                }
            }
            cards = state.cards.get(board.id) || [];
            if (initialCardToOpen && !cardToOpen) {
                const card = cards.find(c =>                      
                    c.dTag === initialCardToOpen.dTag
                );
                if (card) {
                    cardToOpen = card;
                }
            }
        });

        const loadInitialData = async () => {
            try {
                if(board.needsMigration){
                    await kanbanStore.loadCardsForLegacyBoard(board.id);
                } else {
                    await kanbanStore.loadCardsForBoard(board.id);
                }
                loading = false;
            } catch (error) {
                console.error('Failed to load cards:', error);
                loading = false;
            }
        };

        loadInitialData();

        return () => {
            ndkUnsubscribe();
            boardSub();
        };
    });

    $: {
        filteredCards = cards;
        
        isFilterActive = !!(boardFilters.searchText || 
            boardFilters.states.length > 0 || 
            boardFilters.assignees.length > 0 || 
            boardFilters.tags.length > 0);
        
        if (isFilterActive) {
            filteredCards = cards.filter(card => {
                if (boardFilters.states.length > 0 && !boardFilters.states.includes(card.status)) {
                    return false;
                }

                if (boardFilters.assignees.length > 0) {
                    const cardAssignees = card.assignees || [];
                    if (!cardAssignees.some(assignee => boardFilters.assignees.includes(assignee))) {
                        return false;
                    }
                }

                if (boardFilters.searchText && 
                    !card.title.toLowerCase().includes(boardFilters.searchText.toLowerCase())) {
                    return false;
                }

                if (boardFilters.tags.length > 0) {
                    const cardTags = card.tTags || [];
                    if (!cardTags.some(tag => boardFilters.tags.includes(tag))) {
                        return false;
                    }
                }

                return true;
            });
        }
    }

    function handleFilter(event) {
        boardFilters = event.detail;  
    }

    async function handleCardMove(cardId: string, targetStatus: string, targetIndex?: number) {
        const cardToUpdate = cards.find(c => c.id === cardId);
        if (!cardToUpdate) {
            errorMessage = 'Card not found';
            return;
        }

        if (cardToUpdate.status === targetStatus && targetIndex === undefined) {
            return; // No change needed if same column and no reordering
        }

        try {
            await kanbanStore.updateCard(board.id, {
                ...cardToUpdate,
                status: targetStatus
            }, targetIndex);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to move card';
        }
    }

    function getUnmappedCards(allCards: Card[], columns: Column[]): Card[] {
        const validStatuses = new Set(columns.map(col => col.name));
        return allCards.filter(card => !validStatuses.has(card.status));
    }

    $: unmappedCards = getUnmappedCards(cards, board.columns);
    $: showUnmappedColumn = unmappedCards.length > 0;
    

    $: if (cardToOpen) {
        // Find which column contains the card
        const column = board.columns.find(col => 
            cards.some(c => c.id === cardToOpen?.id && c.status === col.name)
        ) || (showUnmappedColumn ? { id: 'unmapped', name: 'UNMAPPED' } : null);
    }

    async function handleAddColumn() {
        if (!newColumnName.trim()) return;

        try {
            const newColumn: Column = {
                id: crypto.randomUUID(),
                name: newColumnName.trim(),
                order: board.columns.length
            };

            await kanbanStore.updateBoard({
                ...board,
                columns: [...board.columns, newColumn]
            });

            showAddColumn = false;
            newColumnName = '';
        } catch (error) {
            console.error('Failed to add column:', error);
        }
    }

    async function handleDeleteColumn(columnName: string) {
        const columnCards = cards.filter(c => c.status === columnName);
        if (columnCards.length > 0) {
            alertMessage = 'Cannot delete column with cards. Move or delete the cards first.';
            showAlert = true;
            return;
        }

        pendingColumnDelete = columnName;
        confirmMessage = `Are you sure you want to delete the column "${columnName}"?`;
        showConfirm = true;
    }

    async function confirmDeleteColumn() {
        if (!pendingColumnDelete) return;

        try {
            await kanbanStore.updateBoard({
                ...board,
                columns: board.columns.filter(c => c.name !== pendingColumnDelete)
            });
        } catch (error) {
            console.error('Failed to delete column:', error);
            alertMessage = 'Failed to delete column. Please try again.';
            showAlert = true;
        }

        showConfirm = false;
        pendingColumnDelete = null;
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            handleAddColumn();
        } else if (event.key === 'Escape') {
            showAddColumn = false;
            newColumnName = '';
        }
    }

    async function handleReorderColumns(newColumns: Column[]) {
        try {
            await kanbanStore.updateBoard({
                ...board,
                columns: newColumns
            });
            showReorderColumns = false;
        } catch (error) {
            console.error('Failed to reorder columns:', error);
            alertMessage = 'Failed to reorder columns. Please try again.';
            showAlert = true;
        }
    }

    function handleBack() {
        push('/');
    }

    $: canEdit = currentUser && 
                 loginMethod !== 'readonly' && 
                 loginMethod !== 'npub' && 
                 currentUser.pubkey === board.pubkey &&
                 !needsMigration


    function doMigration() {
        const migrationUtil = new KanbanMigrationUtil(ndkInstance.ndk!);

        migrationUtil.migrateBoard(board.id, board.pubkey).then(() => {
            needsMigration = false;
        }).catch((e) => {
            console.error('Failed to migrate board:', e);
            alertMessage = 'Failed to migrate board. Please try again.';
            showAlert = true;
        });        
    }

    function startEditingDetails() {
        if (!canEdit) return;
        editedTitle = board.title;
        editedDescription = board.description;
        editedMaintainers = board.maintainers || [];
        isEditingDetails = true;
    }

    async function saveDetails() {
        try {
            await kanbanStore.updateBoard({
                ...board,
                title: editedTitle,
                description: editedDescription,
                maintainers: editedMaintainers
            });
            isEditingDetails = false;
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to update board';
        }
    }

    $: columnCards = board.columns.map(col => ({
        ...col,
        cards: filteredCards
            .filter(card => card.status === col.name)
            .sort((a, b) => a.order - b.order)
    }));

    function handleSettingsAction(event: CustomEvent) {
        const action = event.detail;
        if (action === 'reorderColumns') {
            showReorderColumns = true;
        } else if (action === 'addColumn') {
            showAddColumn = true;
        }
    }

    function toggleFilters() {
        showFilters = !showFilters; 
    }
</script>

<div class="board">
    <header class="board-header">
        <div class="header-actions">
            <div class="left-section">
                <div class="title-section">
                    <button class="back-button" on:click={handleBack} title="Back to boards">
                        <span class="material-icons">keyboard_backspace</span>
                    </button>
                    <h2>{board.title}</h2>
                    {#if canEdit}
                    <button 
                        class="icon-button"
                        class:active={isEditingDetails} 
                        on:click={startEditingDetails}
                        title="Edit board details"
                    >
                        <span class="material-icons">edit</span>
                    </button>                       
                    {/if}
                </div>
                
            </div>
            <div class="right-actions">
                <button 
                    class="icon-button" 
                    on:click={() => showFilters = !showFilters}
                    title={showFilters ? "Hide Filters" : "Show Filters"}
                    class:active={showFilters}
                >
                    <span class="material-icons">filter_alt</span>
                </button>
                <BoardSettings 
                    {canEdit}
                    on:action={handleSettingsAction}
                />
            </div>
        </div>
        <div class="header-content">
            {#if isEditingDetails}
                <div class="edit-details-form">
                    <div class="form-group">
                        <label>Title</label>
                        <input 
                            type="text" 
                            bind:value={editedTitle}
                            placeholder="Board Title"
                        />
                    </div>
                    
                    <div class="form-group">
                        <label>Description</label>
                        <textarea 
                            bind:value={editedDescription}
                            placeholder="Board Description"
                            rows="3"
                        ></textarea>
                    </div>

                    <div class="form-group">
                        <label>Maintainers</label>
                        <MaintainersList 
                            maintainers={editedMaintainers}
                            onChange={(newMaintainers) => editedMaintainers = newMaintainers}
                        />
                    </div>

                    <div class="edit-actions">
                        <button 
                            class="cancel-btn"
                            on:click={() => isEditingDetails = false}
                        >
                            Cancel
                        </button>
                        <button 
                            class="save-btn"
                            on:click={saveDetails}
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            {:else}
                <p class="board-description">{board.description}</p>                
            {/if}
        </div>
        {#if !isEditingDetails}
            <div class="board-meta">
                <div class="meta-group">
                    <span class="meta-label">Creator</span>
                    <UserAvatar pubkey={board.pubkey} size={28} />
                </div>
                <div class="meta-divider"></div>
                <div class="meta-group">
                    <span class="meta-label">Maintainers</span>
                    {#if board.maintainers?.length === 0}
                        <span class="no-maintainer-label">None</span>
                    {:else}
                        <div class="maintainers-avatars">
                        {#each board.maintainers as maintainer}
                            <UserAvatar pubkey={maintainer} size={28} />
                        {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </header>
    {#if needsMigration}
        {#if board && currentUser && (board.pubkey === currentUser.pubkey)}
            <div class="migration-warning">
                <p>This board is using an old data format and needs to be migrated to continue working properly.  You can't edit anything until then.</p>
                <button on:click={doMigration}>Sign All Events and Migrate Board</button>
            </div>
        {/if}
    {/if}

    <div class="board-content">
        {#if showFilters}
            <BoardFilters 
                {cards}
                columns={board.columns}
                filters={boardFilters}  
                on:filter={handleFilter}
                on:close={toggleFilters}
            />
        {/if}

        <div class="columns">
            {#if loading}
                <div class="loading">Loading cards...</div>
            {:else}
                {#if showAddColumn}
                    <div class="add-column-form">
                        <input
                            type="text"
                            bind:value={newColumnName}
                            placeholder="Enter column name"
                            on:keydown={handleKeyDown}
                            autofocus
                        />
                        <div class="add-column-actions">
                            <button class="save" on:click={handleAddColumn}>Save</button>
                            <button class="cancel" on:click={() => {
                                showAddColumn = false;
                                newColumnName = '';
                            }}>Cancel</button>
                        </div>
                    </div>
                {/if}
                
                {#each columnCards as column (column.id)}
                    <Column
                        {column}
                        cards={column.cards}
                        onCardDrop={handleCardMove}
                        {board}
                        isNoZapBoard={board.isNoZapBoard}
                        readOnly={!canEdit}
                        cardToOpen={cardToOpen}
                        onDeleteColumn={() => handleDeleteColumn(column.name)}
                    />
                {/each}
                
                {#if showUnmappedColumn}
                    <Column
                        column={{ id: 'unmapped', name: 'Unmapped Cards', order: -1 }}
                        cards={unmappedCards}
                        onCardDrop={handleCardMove}
                        isUnmapped={true}
                        {board}
                        isNoZapBoard={board.isNoZapBoard}
                        readOnly={!canEdit}
                        cardToOpen={cardToOpen}
                        onDeleteColumn={() => {}}
                    />
                {/if}
            {/if}
        </div>
    </div>
</div>

{#if showAlert}
    <AlertModal 
        message={alertMessage} 
        onClose={() => showAlert = false} 
    />
{/if}

{#if showConfirm}
    <ConfirmModal 
        message={confirmMessage}
        onConfirm={confirmDeleteColumn}
        onCancel={() => {
            showConfirm = false;
            pendingColumnDelete = null;
        }}
    />
{/if}

{#if showReorderColumns}
    <ReorderColumnsModal 
        columns={board.columns}
        onSave={handleReorderColumns}
        onClose={() => showReorderColumns = false}
    />
{/if}

{#if errorMessage}
    <AlertModal 
        message={errorMessage} 
        onClose={() => errorMessage = null} 
    />
{/if}

<style>
    .board {
        height: 90%;
        width: 100%;
    }

    .board-header {
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
        margin-top: 1rem;
    }

    .board-header h2 {
        text-align: left;
    }

    .board-content {
        display: flex;
        flex-direction: column; 
        height: calc(100% - 80px); 
    }

    .columns {
        display: flex;
        gap: 1rem;
        overflow-x: auto;
        height: 100%;
        padding: 1rem;
    }

    .loading {
        width: 100%;
        text-align: center;
        padding: 2rem;
        color: #666;
    }


    .add-column-form {
        background: #f4f5f7;
        border-radius: 8px;
        min-width: 280px;
        max-width: 280px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .add-column-form input {
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }

    .add-column-actions {
        display: flex;
        gap: 0.5rem;
    }

    .add-column-actions button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        flex: 1;
    }

    .add-column-actions .save {
        background: #0052cc;
        color: white;
    }

    .add-column-actions .cancel {
        background: #f4f5f7;
        border: 1px solid #ddd;
    }

    .header-content {
        flex: 1;
        margin-top:1rem;
    }

    .header-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    .right-actions {
        display: flex;
        gap: 1rem;
        margin-left: auto;
    }



    @media (prefers-color-scheme: dark) {
        .board {
            color: #333;
        }

        .board-header h2 {
            color: #eee;
        }

        .board-header p {
            color: #ccc;
        }

        .add-column-actions .cancel {
            color: #333;
        }

    }

    .board-header {
        margin-bottom: 1rem;
    }

    .title-section {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.5rem;
    }

    .title-section h2 {
        margin: 0;
    }

    .header-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    }

    .migration-warning {
        background-color: #fff3cd;
        border: 1px solid #ffeeba;
        color: #856404;
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 4px;
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .migration-warning p {
        margin: 0;
    }

    .migration-warning button {
        background-color: #856404;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
    }

    .migration-warning button:hover {
        background-color: #6d5204;
    }

    @media (prefers-color-scheme: dark) {
        .migration-warning {
            background-color: #332b00;
            border-color: #665500;
            color: #ffd700;
        }

        .migration-warning button {
            background-color: #665500;
        }

        .migration-warning button:hover {
            background-color: #997d00;
        }
    }

    .edit-details-form {
        background: white;
        padding: 1rem;
        padding-right:2rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        width:fit-content;
    }

    .form-group {
        margin-bottom: 1rem;
    }

    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    .form-group input,
    .form-group textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }

    .edit-actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-start;
    }



    .title-section {
        display: flex;
        align-items: center;
    }


    .cancel-btn,
    .save-btn {
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        border: none;
    }

    .cancel-btn {
        background: #f5f5f5;
        color: #333;
    }

    .save-btn {
        background: #0052cc;
        color: white;
    }

    @media (prefers-color-scheme: dark) {
        .edit-details-form {
            background: #2d2d2d;
            color: #fff;
        }

        .form-group input,
        .form-group textarea {
            background: #1d1d1d;
            border-color: #444;
            color: #fff;
        }



        .cancel-btn {
            background: #1d1d1d;
            color: #fff;
        }
    }


    .maintainers-avatars {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
        align-items: center;
    }



    .icon-button {
        background: transparent;
        border: none;
        color: #999;
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }

    .icon-button:hover,
    .icon-button.active {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .icon-button .material-icons {
        font-size: 20px;
    }

    .left-section {
        display: flex;
        align-items: center;
        gap: 2rem;
    }

    .title-section {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .title-section h2 {
        margin: 0;
    }

    .board-description {
        color: #ccc;
        font-size: 14px;
        line-height: 1.5;
        margin: 8px 0;
    }

    .board-meta {
        display: flex;
        align-items: center;
        gap: 24px;
        margin-top: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
    }

    .meta-group {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .meta-label {
        color: #999;
        font-size: 14px;
        font-weight: 500;
    }

    .meta-divider {
        width: 1px;
        height: 24px;
        background: #444;
    }

    .maintainers-avatars {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
    }

    .no-maintainer-label {
        color: #999;
        font-size: 0.9rem;
    }

    .back-button{
        padding:0.25rem;
    }

    @media (prefers-color-scheme: light) {
        .board-description {
            color: #333;
        }

        .board-meta {
            background: rgba(0, 0, 0, 0.05);
        }

        .meta-label {
            color: #666;
        }

        .meta-divider {
            background: #ddd;
        }

        .no-maintainer-label {
            color: #666;
        }
    }
</style> 