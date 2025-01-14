<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import type { KanbanBoard } from '../stores/kanban';
    import { kanbanStore } from '../stores/kanban';

    export let visible: boolean = false;
    export let onClose: () => void;

    const dispatch = createEventDispatcher();
    let boards: KanbanBoard[] = [];
    let loading = true;

    onMount(async () => {
        loading = true;
        try {
            if (!boards.length) {
                await kanbanStore.loadMyBoards();
            }
            
            const unsubscribe = kanbanStore.subscribe(state => {
                boards = state.myBoards;
                loading = false;
            });

            return () => {
                unsubscribe();
            };
        } catch (error) {
            console.error('Failed to load boards:', error);
            loading = false;
        }
    });

    function selectBoard(id: string) {
        dispatch('select', id);
        onClose();
    }
</script>

{#if visible}
    <div class="modal-overlay" on:click={onClose}>
        <div class="modal-content" on:click|stopPropagation>
            <button class="close-icon" on:click={onClose}>
                <span class="material-icons">close</span>
            </button>
            
            <h3>Select Target Board</h3>
            
            <div class="board-list">
                {#if loading}
                    <div class="loading">Loading boards...</div>
                {:else if boards.length === 0}
                    <div class="empty-state">No boards available</div>
                {:else}
                    {#each boards as board}
                        <button 
                            class="board-item" 
                            on:click={() => selectBoard(board.id)}
                        >
                            <span class="board-title">{board.title}</span>
                            <span class="material-icons">chevron_right</span>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1100;
    }

    .modal-content {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        width: 90%;
        max-width: 400px;
        position: relative;
    }

    h3 {
        margin: 0 0 1rem 0;
        color: #333;
    }

    .close-icon {
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        color: #666;
    }

    .close-icon:hover {
        background: #f5f5f5;
        color: #333;
    }

    .board-list {
        max-height: 300px;
        overflow-y: auto;
    }

    .board-item {
        width: 100%;
        padding: 0.75rem 1rem;
        background: none;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #333;
        transition: background-color 0.2s;
        text-align: left;
    }

    .board-item:hover {
        background: #f5f5f5;
    }

    .board-title {
        font-size: 0.9rem;
    }

    .loading, .empty-state {
        padding: 1rem;
        text-align: center;
        color: #666;
        font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
        .modal-content {
            background: #2d2d2d;
        }

        h3 {
            color: #fff;
        }

        .board-item {
            color: #fff;
        }

        .board-item:hover {
            background: #3d3d3d;
        }

        .close-icon {
            color: #fff;
        }

        .close-icon:hover {
            background: #3d3d3d;
        }

        .loading, .empty-state {
            color: #ccc;
        }
    }
</style>
