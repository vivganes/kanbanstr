<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let canEdit: boolean;

    const dispatch = createEventDispatcher();
    let showDropdown = false;

    function handleAction(action: string) {
        dispatch('action', action);
        showDropdown = false;
    }
</script>

<div class="settings-container">
    <button 
        class="icon-button" 
        on:click|stopPropagation={() => showDropdown = !showDropdown}
        title="Board Settings"
    >
        <span class="material-icons">settings</span>
    </button>

    {#if showDropdown}
        <div class="settings-dropdown" on:click|stopPropagation>
                <button 
                    class="dropdown-item"
                    on:click={() => handleAction('reorderColumns')}
                    disabled={!canEdit}
                    title={!canEdit ? "Only the board owner can reorder columns" : ""}
                >
                    ⋮⋮ Reorder Columns
                </button>
                <button 
                    class="dropdown-item"
                    disabled={!canEdit}
                    on:click={() => handleAction('addColumn')}
                    title={!canEdit ? "Only the board owner can add columns" : ""}
                >
                    + Add Column
                </button>
        </div>
    {/if}
</div>

<svelte:window on:click={() => showDropdown = false} />

<style>
    .settings-container {
        position: relative;
    }

    .icon-button {
        background: transparent;
        border: none;
        color: #999;
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
    }

    .icon-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .settings-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: #2d2d2d;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 0.5rem;
        z-index: 1000;
        min-width: 200px;
    }

    .dropdown-item {
        width: 100%;
        text-align: left;
        padding: 0.5rem;
        background: transparent;
        border: none;
        color: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border-radius: 4px;
    }

    .dropdown-item:hover:not(:disabled) {
        background: #3d3d3d;
    }

    .dropdown-item:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    :global(.material-icons) {
        font-size: 20px;
    }
</style> 