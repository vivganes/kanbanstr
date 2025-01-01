<script lang="ts">
    import { onMount, setContext } from 'svelte';
    import type { KanbanBoard, Card } from '../stores/kanban';
    import Column from './Column.svelte';
    import { kanbanStore } from '../stores/kanban';
    import AlertModal from './AlertModal.svelte';
    import ConfirmModal from './ConfirmModal.svelte';
    import ReorderColumnsModal from './ReorderColumnsModal.svelte';

    export let board: KanbanBoard;
    export let initialCardToOpen: { pubkey: string, id: string } | undefined = undefined;
    
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

    onMount(() => {
        const boardSub = kanbanStore.subscribe(state => {
            const boardState = state.boards;
            const boardWithCurrentID = boardState.find(b => b.id === board.id);        
            if (boardWithCurrentID) {
                board = boardWithCurrentID;
            }
        });

        const loadCards = async () => {
            try {
                await kanbanStore.loadCardsForBoard(board.id);
                const cardsSub = kanbanStore.subscribe(state => {
                    cards = state.cards.get(board.id) || [];
                    
                    if (initialCardToOpen && !cardToOpen) {
                        const card = cards.find(c => 
                            c.pubkey === initialCardToOpen.pubkey && 
                            c.id === initialCardToOpen.id
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

        const cardsUnsubscribe = loadCards();

        return () => {
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
</script>

<div class="board">
    <header class="board-header">
        <div class="header-content">
            <h2>{board.title}</h2>
            <p>{board.description}</p>
        </div>
        <div class="header-actions">
            <button class="board-btn" on:click={() => showReorderColumns = true}>
                ⋮⋮ Reorder Columns
            </button>
            <button class="add-column-btn" on:click={() => showAddColumn = true}>
                + Add Column
            </button>
        </div>
    </header>
    
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
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
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
</style> 