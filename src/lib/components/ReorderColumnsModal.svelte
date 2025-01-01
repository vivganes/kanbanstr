<script lang="ts">
    import type { Column } from '../stores/kanban';
    
    export let columns: Column[];
    export let onSave: (newColumns: Column[]) => void;
    export let onClose: () => void;

    let orderedColumns = [...columns];

    function moveColumn(index: number, direction: 'up' | 'down') {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= orderedColumns.length) return;

        const newColumns = [...orderedColumns];
        [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
        orderedColumns = newColumns;
    }

    function handleSave() {
        const reorderedColumns = orderedColumns.map((col, index) => ({
            ...col,
            order: index
        }));
        onSave(reorderedColumns);
    }
</script>

<div class="modal-backdrop" on:click={onClose}>
    <div class="modal" on:click|stopPropagation>
        <div class="modal-content">
            <h3>Reorder Columns</h3>
            <div class="columns-list">
                {#each orderedColumns as column, i (column.id)}
                    <div class="column-item">
                        <span>{column.name}</span>
                        <div class="actions">
                            <button 
                                class="move-btn"
                                disabled={i === 0}
                                on:click={() => moveColumn(i, 'up')}
                                title="Move up"
                            >
                                ↑
                            </button>
                            <button 
                                class="move-btn"
                                disabled={i === orderedColumns.length - 1}
                                on:click={() => moveColumn(i, 'down')}
                                title="Move down"
                            >
                                ↓
                            </button>
                        </div>
                    </div>
                {/each}
            </div>
            <div class="modal-actions">
                <button class="cancel-button" on:click={onClose}>Cancel</button>
                <button class="save-button" on:click={handleSave}>Save Order</button>
            </div>
        </div>
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
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: white;
        border-radius: 8px;
        padding: 1.5rem;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    h3 {
        margin: 0 0 1rem 0;
        color: #333;
    }

    .columns-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        max-height: 60vh;
        overflow-y: auto;
    }

    .column-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: #f4f5f7;
        border-radius: 4px;
        border: 1px solid #dfe1e6;
    }

    .actions {
        display: flex;
        gap: 0.5rem;
    }

    .move-btn {
        background: none;
        border: none;
        padding: 0.4rem 0.6rem;
        cursor: pointer;
        font-size: 1.2rem;
        border-radius: 4px;
        color: #42526e;
    }

    .move-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .move-btn:not(:disabled):hover {
        background: #ebecf0;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1rem;
    }

    button {
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
    }

    .cancel-button {
        background: #f4f5f7;
        border: 1px solid #dfe1e6;
        color: #42526e;
    }

    .save-button {
        background: #0052cc;
        color: white;
        border: none;
    }

    .save-button:hover {
        background: #0047b3;
    }
</style> 