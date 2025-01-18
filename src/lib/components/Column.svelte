<script lang="ts">
    import type { Column, Card, KanbanBoard } from '../stores/kanban';
    import CardComponent from './Card.svelte';
    import CreateCard from './CreateCard.svelte';
    import { ndkInstance } from '../ndk';
    import { onMount, onDestroy } from 'svelte';
    import type { NDKUser } from '@nostr-dev-kit/ndk';
    import { slide } from 'svelte/transition';

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
    let showSearch = false;
    let searchQuery = '';
    let debouncedSearchQuery = '';
    let searchTimeout: NodeJS.Timeout;
    let showSortMenu = false;
    let sortBy = 'created';
    let sortDirection = 'asc';
    let isCustomSorted = false;

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
    
    $: canMaintainBoard = !board.needsMigration && 
                         loginMethod !== 'readonly' && 
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

    $: {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            debouncedSearchQuery = searchQuery;
        }, 300);
    }

    onDestroy(() => {
        clearTimeout(searchTimeout);
    });

    $: filteredCards = debouncedSearchQuery 
        ? cards.filter(card => 
            card.title.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            card.description?.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
          )
        : cards;

    $: sortedAndFilteredCards = [...filteredCards].sort((a, b) => {
        if (sortBy === 'created') {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
        } else if (sortBy === 'zaps') {
            const zapAmountA = a.zapAmount || 0;
            const zapAmountB = b.zapAmount || 0;
            return sortDirection === 'asc' ? zapAmountA - zapAmountB : zapAmountB - zapAmountA;
        }
        return 0;
    });

    $: hasNoResults = debouncedSearchQuery && filteredCards.length === 0;

    function handleColumnBlur(event: FocusEvent) {
        const column = event.currentTarget as HTMLElement;
        const relatedTarget = event.relatedTarget as HTMLElement;
        
        if (!relatedTarget || !column.contains(relatedTarget)) {
            showSortMenu = false;
            showSearch = false;
        }
    }

    function handleSortChange() {
        isCustomSorted = true;
        setTimeout(() => {
            showSortMenu = false;
        }, 5000);
    }

    function getSortTooltip(): string {
        if (!isCustomSorted) return "Sort cards";
        
        const direction = sortDirection === 'asc' ? 'ascending' : 'descending';
        const sortType = sortBy === 'created' ? 'creation date' : 'zap amount';
        
        return `Sorted by ${sortType} (${direction})`;
    }
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
    on:blur={handleColumnBlur}
    tabindex="-1"
>
    <header class="column-header">
        <div class="title-row">
            <h3>{column.name}</h3>        
            {#if canEditBoard && !isUnmapped && showDeleteButton}
                <button 
                    class="delete-column-btn" 
                    on:click|stopPropagation={onDeleteColumn}
                    title="Delete column"
                >
                    ×
                </button>
            {/if}
        </div>
        <div class="column-toolbar">
            {#if canEditBoard || canMaintainBoard}
                <button 
                    class="add-card-btn" 
                    on:click={openCreateModal}
                >
                    + New Card
                </button>
            {/if}
            <button 
                class="toolbar-btn"
                class:active={showSearch}
                on:click={() => {
                    showSearch = !showSearch;
                    if (showSearch) showSortMenu = false;
                }}
                title="Search cards"
            >
                <span class="material-icons">search</span>
            </button>
            <button 
                class="toolbar-btn"
                class:active={showSortMenu || isCustomSorted}
                on:click={() => {
                    showSortMenu = !showSortMenu;
                    if (showSortMenu) showSearch = false;
                }}
                title={getSortTooltip()}
            >
                <span class="material-icons">
                    {isCustomSorted ? (sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'sort'}
                </span>
            </button>
        </div>
        
        <div 
            class="controls-container"
            on:blur={handleColumnBlur}
            tabindex="-1"
        >
            {#if showSearch}
                <div class="search-container" transition:slide>
                    <div class="search-input-wrapper">
                        <input
                            type="text"
                            placeholder="Search in titles and descriptions..."
                            bind:value={searchQuery}
                            class="search-input"
                        />
                        {#if searchQuery}
                            <button 
                                class="clear-search" 
                                on:click={() => searchQuery = ''}
                                title="Clear search"
                            >
                                <span class="material-icons">close</span>
                            </button>
                        {/if}
                    </div>
                </div>
            {/if}
            
            {#if showSortMenu}
                <div class="sort-container" transition:slide>
                    <select 
                        bind:value={sortBy} 
                        class="sort-select"
                        on:change={handleSortChange}
                    >
                        <option value="created">Created Date</option>
                        <option value="zaps">Zaps</option>
                    </select>
                    <button 
                        class="sort-direction"
                        on:click={() => {
                            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                            handleSortChange();
                        }}
                        title={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
                    >
                        <span class="material-icons">
                            {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                    </button>
                </div>
            {/if}
        </div>
    </header>

    <div class="cards">
        {#if hasNoResults}
            <div class="no-results" transition:slide>
                <span class="material-icons">search_off</span>
                <p>No cards found matching "{debouncedSearchQuery}"</p>
            </div>
        {:else}
            {#each sortedAndFilteredCards as card (card.id)}
                <div
                    class="card-wrapper"
                    on:dragover|preventDefault|stopPropagation={(e) => handleDragOver(e, card.order)}
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
        {/if}
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
        padding: 0.75rem;
        border-bottom: 1px solid #ddd;
        background: white;
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
    }

    .title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .new-card-row {
        width: 100%;
    }

    .add-card-btn {
        flex: 1;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.5rem;
        cursor: pointer;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
    }

    .add-card-btn:hover {
        background: #0047b3;
    }

    h3 {
        margin: 0;
    }

    .cards {
        flex: 1;
        overflow-y: auto;
        padding: 0.5rem;
        min-height: 100px;
        display: flex;
        flex-direction: column;
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

    .column-toolbar {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    .add-card-btn {
        flex: 1;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        height: 36px;
        padding: 0 0.75rem;
        cursor: pointer;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
    }

    .add-card-btn:hover {
        background: #0047b3;
    }

    .toolbar-btn {
        background: none;
        border: none;
        height: 36px;
        width: 36px;
        border-radius: 4px;
        cursor: pointer;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }

    .toolbar-btn .material-icons {
        font-size: 20px;
    }

    .toolbar-btn:hover {
        background: #e4e6e8;
        color: #333;
    }

    .toolbar-btn.active {
        background: #e4e6e8;
        color: #0052cc;
    }

    .controls-container {
        height: 0;
        overflow: hidden;
        outline: none;
    }

    .controls-container:has(.search-container),
    .controls-container:has(.sort-container) {
        height: auto;
        margin-top: 0.5rem;
    }

    .search-container, .sort-container {
        padding: 0.5rem 0;
    }

    .search-input {
        width: 100%;
        height: 36px;
        padding: 0 2.5rem 0 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 0.9rem;
        transition: border-color 0.2s;
    }

    .sort-container {
        display: flex;
        gap: 0.5rem;
    }

    .sort-select {
        flex: 1;
        height: 36px;
        padding: 0 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 0.9rem;
        background: white;
        cursor: pointer;
    }

    .sort-direction {
        height: 36px;
        width: 36px;
        padding: 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    @media (prefers-color-scheme: dark) {

        .toolbar-btn {
            color: #ccc;
        }

        .toolbar-btn:hover {
            background: #3d3d3d;
            color: #fff;
        }

        .toolbar-btn.active {
            background: #3d3d3d;
            color: #66b2ff;
        }

        .search-input,
        .sort-select,
        .sort-direction {
            background: #1d1d1d;
            border-color: #444;
            color: #fff;
        }

        .search-input:focus,
        .sort-select:focus {
            border-color: #66b2ff;
        }

        .sort-direction:hover {
            background: #2d2d2d;
            border-color: #555;
        }

        .add-card-btn {
            background: #0047b3;
        }

        .add-card-btn:hover {
            background: #003d99;
        }
    }

    .no-results {
        padding: 1rem;
        text-align: center;
        color: #666;
        background: #f5f5f5;
        border-radius: 4px;
        margin: 0.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
    }

    .no-results .material-icons {
        font-size: 24px;
        color: #999;
    }

    .no-results p {
        margin: 0;
        font-size: 0.9rem;
    }

    @media (prefers-color-scheme: dark) {
        .no-results {
            background: #2d2d2d;
            color: #ccc;
        }

        .no-results .material-icons {
            color: #666;
        }
    }

    .search-input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
    }

    .clear-search {
        position: absolute;
        right: 0.5rem;
        background: none;
        border: none;
        padding: 0.25rem;
        cursor: pointer;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s;
    }

    .clear-search:hover {
        background: #f0f0f0;
        color: #333;
    }

    .clear-search .material-icons {
        font-size: 18px;
    }

    @media (prefers-color-scheme: dark) {
        .clear-search {
            color: #999;
        }

        .clear-search:hover {
            background: #3d3d3d;
            color: #fff;
        }
    }
</style> 