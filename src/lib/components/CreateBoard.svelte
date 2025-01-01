<script lang="ts">
    import { kanbanStore } from '../stores/kanban';
    import type { Column } from '../stores/kanban';

    export let onClose: () => void;

    let title = '';
    let description = '';
    let columns: Column[] = [
        { id: crypto.randomUUID(), name: 'To Do', order: 0 },
        { id: crypto.randomUUID(), name: 'In Progress', order: 1 },
        { id: crypto.randomUUID(), name: 'Done', order: 2 }
    ];

    let newColumnName = '';

    async function handleSubmit() {
        if (!title.trim()) return;

        await kanbanStore.createBoard(title, description, columns);
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
                            <span>{column.name}</span>
                            {#if columns.length > 1}
                                <button
                                    type="button"
                                    class="remove-btn"
                                    on:click={() => removeColumn(i)}
                                >
                                    &times;
                                </button>
                            {/if}
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
    }

    .remove-btn {
        background: none;
        border: none;
        color: #ff4444;
        cursor: pointer;
        padding: 0 0.5rem;
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
</style> 