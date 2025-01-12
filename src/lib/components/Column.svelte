<script lang="ts">
    import type { Column, Card, KanbanBoard } from '../stores/kanban';
    import CardComponent from './Card.svelte';
    import CreateCard from './CreateCard.svelte';
    import { ndkInstance } from '../ndk';
    import { onMount } from 'svelte';
    import type { NDKUser } from '@nostr-dev-kit/ndk';

    export let column: Column;
    export let cards: Card[];
    export let readOnly: boolean = false;
    export let onCardDrop: (cardId: string, targetStatus: string, targetIndex?: number) => Promise<void>;
    export let isUnmapped: boolean = false;
    export let cardToOpen: Card | null = null;
    export let isNoZapBoard: boolean = false;
    export let onDeleteColumn: () => void;
    export let board: KanbanBoard;

    let showCreateModal = false;
    let isDragOver = false;
    let dragOverIndex: number | null = null;
    let showDeleteButton = false;
    let currentUser: NDKUser | null = null;
    let loginMethod: string | null = null;

    onMount(() => {
        const unsubscribe = ndkInstance.store.subscribe(state => {
            currentUser = state.user;
            loginMethod = state.loginMethod;
        });

        return unsubscribe;
    });

    $: canEditBoard = !readOnly &&  
                     loginMethod !== 'readonly' && 
                     loginMethod !== 'npub' && 
                     currentUser && 
                     currentUser.pubkey === board.pubkey;
    
    $: canMaintainBoard = loginMethod !== 'readonly' && 
                         loginMethod !== 'npub' && 
                         currentUser && 
                         (currentUser.pubkey === board.pubkey || board.maintainers?.includes(currentUser.pubkey));

    function openCreateModal() {
        showCreateModal = true;
    }

    function closeCreateModal() {
        showCreateModal = false;
    }

    function handleDragOver(event: DragEvent, index: number) {
        if (isUnmapped) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        isDragOver = true;
        dragOverIndex = index;
    }

    function handleDragLeave() {
        isDragOver = false;
        dragOverIndex = null;
    }

    async function handleDrop(event: DragEvent) {
        if (isUnmapped) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        isDragOver = false;
        
        const data = event.dataTransfer?.getData('application/json');
        if (!data) return;

        const { cardId } = JSON.parse(data);
        const targetIndex = dragOverIndex;
        dragOverIndex = null;

        await onCardDrop(cardId, column.name, targetIndex);
    }

    function handleColumnDragOver(event: DragEvent) {
        if (isUnmapped) {
            event.preventDefault();
            return;
        }

        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        isDragOver = true;
        dragOverIndex = cards.length;
    }

    // Make cards reactive
    $: sortedCards = cards.sort((a, b) => a.order - b.order);
</script>

<div 
    class="column"
    class:drag-over={isDragOver}
    class:unmapped={isUnmapped}
    on:mouseenter={() => showDeleteButton = true}
    on:mouseleave={() => showDeleteButton = false}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
    on:dragover|preventDefault={handleColumnDragOver}
>
    <header class="column-header">
        <h3>{column.name}</h3>
        <!-- <div>
            <p>{canEditBoard}</p>
            <p>{currentUser?.pubkey}</p>
            <p>{board.maintainers}</p>
            <p>{canMaintainBoard}</p>
        </div> -->
        
        <div class="column-actions">
            {#if canEditBoard && !isUnmapped && showDeleteButton}
                <button 
                    class="delete-column-btn" 
                    on:click|stopPropagation={onDeleteColumn}
                    title="Delete column"
                >
                    ×
                </button>
            {/if}
            {#if canEditBoard || canMaintainBoard}
                <button 
                    class="add-card-btn" 
                    on:click={openCreateModal}
                >
                    + New Card
                </button>
            {/if}            
        </div>
    </header>

    <div class="cards">
        {#each sortedCards as card, i (card.dTag)}            
            <div
                class="card-wrapper"
                on:dragover|preventDefault|stopPropagation={(e) => handleDragOver(e, i)}
                on:drop|preventDefault|stopPropagation={handleDrop}
            >
                <CardComponent 
                    {card} 
                    boardId={board.id}
                    boardPubkey={board.pubkey}
                    {isUnmapped}
                    showDetails={cardToOpen?.id === card.id} 
                    {isNoZapBoard}     
                    readOnly={!canMaintainBoard}               
                />
            </div>
        {/each}
        <div 
            class="card-wrapper empty"
            on:dragover|preventDefault|stopPropagation={(e) => handleDragOver(e, cards.length)}
            on:drop|preventDefault|stopPropagation={handleDrop}
        />
    </div>

    {#if showCreateModal}
        <CreateCard
            onClose={closeCreateModal}
            columnName={column.name}
            aTagPointingToBoard={`30301:${board.pubkey}:${board.id}`} 
            cardsCount={cards.length}
        />
    {/if}
</div>

<style>
    .column {
        background: #f4f5f7;
        border-radius: 8px;
        min-width: 280px;
        max-width: 280px;
        height: 100%;
        display: flex;
        flex-direction: column;
        transition: background-color 0.2s ease;
    }

    .column.drag-over {
        background: #e3e9f3;
    }

    .column-header {
        padding: 1rem;
        border-bottom: 1px solid #ddd;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .cards {
        flex: 1;
        overflow-y: auto;
        padding: 0.5rem;
        min-height: 100px;
        display: flex;
        flex-direction: column;
    }

    .add-card-btn {
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .add-card-btn:hover {
        opacity: 0.9;
    }

    h3 {
        margin: 0;
    }

    .card-wrapper {
        padding: 4px 0;
    }

    .card-wrapper.empty {
        flex: 1;
        min-height: 20px;
    }

    .column.unmapped {
        background: #f0f0f0;
        border: 2px dashed #ccc;
    }

    .column.unmapped.drag-over {
        background: #f0f0f0;
    }

    .column.unmapped .add-card-btn {
        display: none;
    }

    .column-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .delete-column-btn {
        background: none;
        border: none;
        color: #666;
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .delete-column-btn:hover {
        background: #ffebee;
        color: #d32f2f;
    }

    .add-card-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: auto;
    }

    @media (prefers-color-scheme: dark) {
        .add-card-btn:disabled {
            opacity: 0.5;
        }
    }
</style> 