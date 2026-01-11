<script lang="ts">
    import { kanbanStore } from '../stores/kanban';
    import type { Column } from '../stores/kanban';
    import MaintainersList from './MaintainersList.svelte';

    export let onClose: () => void;

    let title = '';
    let description = '';
    let maintainers: string[] = [];
    let columns: Column[] = [
        { id: crypto.randomUUID(), name: 'To Do', order: 0 },
        { id: crypto.randomUUID(), name: 'In Progress', order: 1 },
        { id: crypto.randomUUID(), name: 'Done', order: 2 }
    ];

    let newColumnName = '';

    async function handleSubmit() {
        if (!title.trim()) return;

        await kanbanStore.createBoard(title, description, columns, maintainers);
        onClose();
    }

    function addColumn() {
        if (!newColumnName.trim()) return;

        columns = [
            ...columns,
            {
                id: crypto.randomUUID(),
                name: newColumnName,
                order: columns.length
            }
        ];
        newColumnName = '';
    }

    function removeColumn(index: number) {
        columns = columns.filter((_, i) => i !== index);
        // Update order after removal
        columns = columns.map((col, i) => ({ ...col, order: i }));
    }

    function moveColumn(index: number, direction: 'up' | 'down') {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= columns.length) return;

        const newColumns = [...columns];
        [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
        columns = newColumns.map((col, i) => ({ ...col, order: i }));
    }
</script>

<div class="modal-backdrop" on:click={onClose}>
    <div class="modal" on:click|stopPropagation>
        <header>
            <h2>Create New Board</h2>
            <button class="close-btn" on:click={onClose}>&times;</button>
        </header>

        <form on:submit|preventDefault={handleSubmit}>
            <div class="form-group">
                <label for="name">Board Name</label>
                <input
                    id="name"
                    bind:value={title}
                    placeholder="Enter board name"
                    required
                />
            </div>

            <div class="form-group">
                <label for="description">Description</label>
                <textarea
                    id="description"
                    bind:value={description}
                    placeholder="Enter board description"
                    rows="3"
                />
            </div>

            <div class="form-group">
                <label>Columns</label>
                <div class="columns-list">
                    {#each columns as column, i (column.id)}
                        <div class="column-item">
                            <input
                                class="column-name-input"
                                type="text"
                                bind:value={column.name}
                                placeholder="Column name"
                            />
                            <div class="column-actions">
                                <button
                                    type="button"
                                    class="move-btn"
                                    disabled={i === 0}
                                    on:click={() => moveColumn(i, 'up')}
                                    title="Move up"
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    class="move-btn"
                                    disabled={i === columns.length - 1}
                                    on:click={() => moveColumn(i, 'down')}
                                    title="Move down"
                                >
                                    ↓
                                </button>
                                {#if columns.length > 1}
                                    <button
                                        type="button"
                                        class="remove-btn"
                                        on:click={() => removeColumn(i)}
                                        title="Remove column"
                                    >
                                        &times;
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>

                <div class="add-column">
                    <input
                        bind:value={newColumnName}
                        placeholder="New column name"
                        on:keydown={(e) => e.key === 'Enter' && addColumn()}
                    />
                    <button type="button" on:click={addColumn}>Add Column</button>
                </div>
            </div>

            <div class="form-group">
                <label>Board Maintainers</label>
                <MaintainersList 
                    {maintainers} 
                    onChange={(newMaintainers) => maintainers = newMaintainers} 
                />
            </div>

            <div class="actions">
                <button type="button" class="cancel" on:click={onClose}>
                    Cancel
                </button>
                <button type="submit" class="create">Create Board</button>
            </div>
        </form>
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

    input, textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }

    .columns-list {
        margin-bottom: 1rem;
    }

    .column-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        gap: 0.5rem;
    }

    .column-name-input {
        flex: 1;
        margin-bottom: 0;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
    }

    .column-name-input:focus {
        outline: none;
        border-color: #0052cc;
        box-shadow: 0 0 0 2px rgba(0, 82, 204, 0.1);
    }

    .column-actions {
        display: flex;
        gap: 0.25rem;
        align-items: center;
    }

    .move-btn {
        background: none;
        border: none;
        padding: 0.2rem 0.4rem;
        cursor: pointer;
        font-size: 1.2rem;
        color: #42526e;
        border-radius: 4px;
    }

    .move-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .move-btn:not(:disabled):hover {
        background: #ebecf0;
    }

    .remove-btn {
        background: none;
        border: none;
        color: #ff4444;
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        font-size: 1.2rem;
        border-radius: 4px;
    }

    .remove-btn:hover {
        background: #ffe0e0;
    }

    .add-column {
        display: flex;
        gap: 0.5rem;
    }

    .add-column input {
        margin-bottom: 0;
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

    @media (prefers-color-scheme: dark) {
        .modal-backdrop {
            color: #333;
        }
    }
</style> 