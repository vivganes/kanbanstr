<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { KanbanBoard } from '../stores/kanban';

    export let boards: KanbanBoard[] = [];
    export let visible: boolean = false; 
    export let onClose: () => void; 

    const dispatch = createEventDispatcher();

    function selectBoard(id: string) {
        dispatch('select', id); 
        onClose();
    }
</script>

{#if visible}
    <div class="modal-overlay" on:click={onClose}>
        <div class="modal-content" on:click|stopPropagation>
            <h3>Select Target Board</h3>
            <div class="board-list">
                {#each boards as board}
                    <div class="board-item" on:click={() => selectBoard(board.id)}>
                        {board.title}
                    </div>
                {/each}
            </div>
            <button class="close-button" on:click={onClose}>Close</button>
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
        z-index: 1000;
    }

    .modal-content {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        width: 300px; 
    }

    .board-list {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 1rem;
    }

    .board-item {
        padding: 0.5rem 1rem;
        cursor: pointer;
    }

    .board-item:hover {
        background: #f5f5f5;
    }

    .close-button {
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        cursor: pointer;
    }
</style>