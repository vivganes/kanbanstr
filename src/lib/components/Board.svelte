<script lang="ts">
    import { onMount, setContext } from 'svelte';
    import type { KanbanBoard, Card } from '../stores/kanban';
    import Column from './Column.svelte';
    import { kanbanStore } from '../stores/kanban';
    import AlertModal from './AlertModal.svelte';
    import ConfirmModal from './ConfirmModal.svelte';
    import ReorderColumnsModal from './ReorderColumnsModal.svelte';
    import { ndkInstance } from '../ndk';
    import { push } from 'svelte-spa-router';
    import KanbanMigrationUtil from '../utils/MigrationUtilV1';

    export let board: KanbanBoard;
    export let initialCardToOpen: { pubkey: string, dTag: string } | undefined = undefined;
    
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

    onMount(() => {
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
        });

        const loadCards = async () => {
            try {
                if(board.needsMigration){
                    await kanbanStore.loadCardsForLegacyBoard(board.id);
                } else {
                    await kanbanStore.loadCardsForBoard(board.id);
                }
                const cardsSub = kanbanStore.subscribe(state => {
                    cards = state.cards.get(board.id) || [];
                    
                    if (initialCardToOpen && !cardToOpen) {
                        const card = cards.find(c => 
                            c.pubkey === initialCardToOpen.pubkey && 
                            c.dTag === initialCardToOpen.dTag
                        );
                        if (card) {
                            cardToOpen = card;
                        }
                    }
                });

                loading = false;
                return cardsSub;
            } catch (error) {
                console.error('Failed to load cards:', error);
                loading = false;
                return () => {};
            }
        };

        loadCards();

        return () => {
            ndkUnsubscribe();
            boardSub();
        };
    });

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
</script>

<div class="board">
    <header class="board-header">
        <div class="header-actions">
            <button class="back-button" on:click={handleBack}>&larr; Back to Boards</button>

            <button 
                class="board-btn" 
                on:click={() => showReorderColumns = true}
                disabled={!canEdit}
                title={!canEdit ? "Only the board owner can reorder columns" : ""}
            >
                ⋮⋮ Reorder Columns
            </button>
            <button 
                class="add-column-btn" 
                on:click={() => showAddColumn = true}
                disabled={!canEdit}
                title={!canEdit ? "Only the board owner can add columns" : ""}
            >
                + Add Column
            </button>
        </div>
        <div class="header-content">
            <div class="title-section">
                <h2>{board.title}</h2>                
            </div>
            <p>{board.description}</p>
        </div>
    </header>
    {#if needsMigration}
        {#if board && currentUser && (board.pubkey === currentUser.pubkey)}
            <div class="migration-warning">
                <p>This board is using an old data format and needs to be migrated to continue working properly.  You can't edit anything until then.</p>
                <button on:click={doMigration}>Sign All Events and Migrate Board</button>
            </div>
        {/if}
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
            
            {#each board.columns as column (column.id)}
                <Column 
                    {column}
                    cards={cards.filter(c => c.status === column.name)}
                    boardId={board.id}
                    boardPubkey={board.pubkey}
                    onCardDrop={handleCardMove}
                    cardToOpen={cardToOpen}
                    onDeleteColumn={() => handleDeleteColumn(column.name)}
                    isNoZapBoard={board.isNoZapBoard}
                />
            {/each}
            {#if showUnmappedColumn}
                <Column 
                    column={{ id: 'unmapped', name: 'UNMAPPED', order: board.columns.length }}
                    cards={unmappedCards}
                    boardId={board.id}
                    boardPubkey={board.pubkey}
                    onCardDrop={handleCardMove}
                    isUnmapped={true}
                    cardToOpen={cardToOpen}
                    isNoZapBoard={board.isNoZapBoard}
                />
            {/if}
        {/if}
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

    .columns {
        display: flex;
        gap: 1rem;
        overflow-x: auto;
        height: calc(90% - 80px);
        width: 100%;
    }

    .loading {
        width: 100%;
        text-align: center;
        padding: 2rem;
        color: #666;
    }

    .add-column-btn {
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
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
        gap: 1rem;
        align-items: center;
    }

    .board-btn {
        padding: 0.5rem 1rem;
        background: #f4f5f7;
        color: #42526e;
        border: 1px solid #dfe1e6;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .board-btn:hover {
        background: #ebecf0;
    }

    .board-btn:disabled,
    .add-column-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        /* Keep the hover style even when disabled for better UX */
        pointer-events: auto;
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

        .board-btn:disabled:hover,
        .add-column-btn:disabled:hover {
            background: #1e1855;
            opacity: 0.5;
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
        gap: 1rem;
        align-items: center;
    }

    .back-button {
        padding: 0.5rem 1rem;
        background: #f4f5f7;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #42526e;
    }

    .back-button:hover {
        background: #e4e6e8;
    }

    .migration-warning {
        background-color: #fff3cd;
        border: 1px solid #ffeeba;
        color: #856404;
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 4px;
        display: flex;
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

    @media (prefers-color-scheme: dark) {
        .back-button {
            background: #1e1855;
            color: #fff;
        }

        .back-button:hover {
            background: #2e2955;
        }
    }
</style> 