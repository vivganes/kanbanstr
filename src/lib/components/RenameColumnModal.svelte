<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let visible = false;
    export let columnName = '';
    
    const dispatch = createEventDispatcher();
    
    let newColumnName = columnName;
    let updateCardStatuses = true;

    function handleSubmit() {
        if (!newColumnName.trim()) return;
        
        dispatch('rename', {
            newName: newColumnName.trim(),
            updateCards: updateCardStatuses
        });
        
        visible = false;
    }

    function handleClose() {
        visible = false;
        dispatch('close');
    }
</script>

{#if visible}
<div class="modal-backdrop" on:click={handleClose}>
    <div class="modal-content" on:click|stopPropagation>
        <h3>Rename Column</h3>
        <div class="form-group">
            <label for="columnName">New Column Name</label>
            <input
                type="text"
                id="columnName"
                bind:value={newColumnName}
                placeholder="Enter new column name"
                autofocus
            />
        </div>
        <div class="form-group">
            <label class="checkbox-label">
                <input
                    type="checkbox"
                    bind:checked={updateCardStatuses}
                />
                Update status of all cards in this column
            </label>
            <p class="help-text">
                {#if updateCardStatuses}
                    All cards in this column will have their status updated to the new name
                {:else}
                    Cards will keep their current status and may appear in the 'Unmapped Cards' column at the end
                {/if}
            </p>
        </div>
        <div class="modal-actions">
            <button class="cancel-btn" on:click={handleClose}>Cancel</button>
            <button class="save-btn" on:click={handleSubmit}>Rename Column</button>
        </div>
    </div>
</div>
{/if}

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

    .modal-content {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        width: 90%;
        max-width: 400px;
    }

    .form-group {
        margin-bottom: 1rem;
    }

    .form-group label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }

    .help-text {
        margin-top: 0.5rem;
        font-size: 0.875rem;
        color: #666;
    }

    input[type="text"] {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1.5rem;
    }

    .cancel-btn, .save-btn {
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.875rem;
    }

    .cancel-btn {
        background: none;
        border: 1px solid #ddd;
    }

    .save-btn {
        background: #0052cc;
        color: white;
        border: none;
    }

    @media (prefers-color-scheme: dark) {
        .modal-content {
            background: #2d2d2d;
            color: #fff;
        }

        input[type="text"] {
            background: #1d1d1d;
            border-color: #444;
            color: #fff;
        }

        .help-text {
            color: #999;
        }

        .cancel-btn {
            border-color: #444;
            color: #fff;
        }
    }
</style> 