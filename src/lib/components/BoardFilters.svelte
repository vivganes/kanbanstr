<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Card } from '../stores/kanban';
    import UserAvatar from './UserAvatar.svelte';
    import { ndkInstance } from '../ndk';

    export let cards: Card[] = [];
    export let columns: any[] = [];
    export let items: any[];
    export let type: 'status' | 'assignees' | 'tags';
    export let onFilter: (filters: any) => void = () => {};  
    export let selectedFilters: any; 
    export let filters: any;

    const dispatch = createEventDispatcher();

    let selectedStates = filters.states || [];
    let selectedAssignees = filters.assignees || [];
    let selectedTags = filters.tags || [];
    let searchText = filters.searchText || '';

    let activeDropdown: 'states' | 'assignees' | 'tags' | null = null;

    let showStatesDropdown = false;
    let showAssignedDropdown = false;
    let showTagsDropdown = false;
    let userNames = new Map();

    $: uniqueAssignees = [...new Set(cards.flatMap(card => card.assignees || []))];

    $: uniqueTags = [...new Set(cards.flatMap(card => card.tTags || []))];


    $: {
        uniqueAssignees.forEach(async (pubkey) => {
            if (!userNames.has(pubkey)) {
                const user = await ndkInstance.ndk?.getUser({ pubkey });
                if (user) {
                    await user.fetchProfile();
                    userNames.set(pubkey, user.profile?.name || user.profile?.displayName || 'Unknown User');
                    userNames = userNames; 
                }
            }
        });
    }

    function toggleDropdown(dropdown: 'states' | 'assignees' | 'tags') {
        activeDropdown = activeDropdown === dropdown ? null : dropdown;
    }

    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.filter-dropdown')) {
            activeDropdown = null;
        }
    }

    function updateFilters() {
        dispatch('filter', {
            states: selectedStates,
            assignees: selectedAssignees,
            tags: selectedTags,
            searchText
        });
    }

    $: {
        filters.states = selectedStates;
        filters.assignees = selectedAssignees;
        filters.tags = selectedTags;
        filters.searchText = searchText;
    }

    function clearFilter(type: 'status' | 'assignees' | 'tags') {
        switch(type) {
            case 'status':
                selectedStates = [];
                break;
            case 'assignees':
                selectedAssignees = [];
                break;
            case 'tags':
                selectedTags = [];
                break;
        }
        updateFilters();
    }

    function clearAllFilters() {
        selectedStates = [];
        selectedAssignees = [];
        selectedTags = [];
        searchText = '';
        updateFilters();
    }
</script>

<div class="filter-bar">
    <div class="filter-left">
        <span class="material-icons filter-icon">filter_list</span>
        <input 
            type="text" 
            bind:value={searchText} 
            placeholder="Filter by keyword"
            class="search-input"
            on:input={updateFilters}
        />
    </div>
    <div class="filter-right">
        <div class="filter-buttons">
            <div class="filter-dropdown">
                <button 
                    class="filter-button" 
                    on:click={() => toggleDropdown('states')}
                    class:active={activeDropdown === 'states'}
                >
                    Status {selectedStates.length ? `(${selectedStates.length})` : ''} ▼
                </button>
                {#if activeDropdown === 'states'}
                    <div class="dropdown-menu" on:click|stopPropagation>
                        {#if columns.length > 0}
                            {#each columns as column}
                                <label class="checkbox-label">
                                    <input
                                        type="checkbox"
                                        value={column.name}
                                        bind:group={selectedStates}
                                        on:change={() => updateFilters()}
                                    />
                                    <span class="checkbox-text">{column.name}</span>
                                </label>
                            {/each}
                            {#if selectedStates.length > 0}
                                <div class="dropdown-divider"></div>
                                <button 
                                    class="clear-filter" 
                                    on:click={() => clearFilter('status')}
                                >
                                 <span class="material-icons">close</span>
                                    Clear
                                </button>
                            {/if}
                        {:else}
                            <div class="empty-state">
                                No status available
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <div class="filter-dropdown">
                <button 
                    class="filter-button"
                    on:click={() => toggleDropdown('assignees')}
                    class:active={activeDropdown === 'assignees'}
                >
                    Assigned to {selectedAssignees.length ? `(${selectedAssignees.length})` : ''} ▼
                </button>
                {#if activeDropdown === 'assignees'}
                    <div class="dropdown-menu" on:click|stopPropagation>
                        {#if uniqueAssignees.length > 0}
                            {#each uniqueAssignees as assignee}
                                <label class="checkbox-label">
                                    <input
                                        type="checkbox"
                                        value={assignee}
                                        bind:group={selectedAssignees}
                                        on:change={() => updateFilters()}
                                    />
                                    <div class="assignee-info"  >
                                        <UserAvatar pubkey={assignee} size={24} />
                                        <span class="checkbox-text">{userNames.get(assignee) || 'Loading...'}</span>
                                    </div>
                                </label>
                            {/each}
                            {#if selectedAssignees.length > 0}
                                <div class="dropdown-divider"></div>
                                <button 
                                    class="clear-filter" 
                                    on:click={() => clearFilter('assignees')}
                                >
                                 <span class="material-icons">close</span>
                                    Clear
                                </button>
                            {/if}
                        {:else}
                            <div class="empty-state">
                                No users available
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>

            <div class="filter-dropdown">
                <button 
                    class="filter-button"
                    on:click={() => toggleDropdown('tags')}
                    class:active={activeDropdown === 'tags'}
                >
                    Tags {selectedTags.length ? `(${selectedTags.length})` : ''} ▼
                </button>
                {#if activeDropdown === 'tags'}
                    <div class="dropdown-menu" on:click|stopPropagation>
                        {#if uniqueTags.length > 0}
                            {#each uniqueTags as tag}
                                <label class="checkbox-label">
                                    <input
                                        type="checkbox"
                                        value={tag}
                                        bind:group={selectedTags}
                                        on:change={() => updateFilters()}
                                    />
                                    {tag}
                                </label>
                            {/each}
                            {#if selectedTags.length > 0}
                                <div class="dropdown-divider"></div>
                                <button 
                                    class="clear-filter" 
                                    on:click={() => clearFilter('tags')}
                                >
                                 <span class="material-icons">close</span>
                                    Clear
                                </button>
                            {/if}
                        {:else}
                            <div class="empty-state">
                                No tags available
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <button class="close-button" on:click={clearAllFilters}>×</button>
    </div>
</div>

<svelte:window on:click={handleClickOutside} />

<style>
    .filter-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 16px;
        background: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
    }

    .filter-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }

    .filter-right {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .filter-buttons {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .filter-dropdown {
        position: relative;
    }

    .filter-button {
        background: #ffffff;
        border: 1px solid #dee2e6;
        color: #333333;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
    }

    .filter-button.active {
        background: #e9ecef;
    }

    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        background: #ffffff;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        margin-top: 4px;
        min-width: 200px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 1000;
        color: #333333;
    }

    .clear-filter {
        width: 100%;
        text-align: left;
        padding: 8px;
        border: none;
        background: none;
        color: #666666;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .clear-filter:hover {
        background: #f8f9fa;
    }

    .dropdown-divider {
        height: 1px;
        background: #dee2e6;
    }

    .checkbox-label {
        padding: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .checkbox-label:hover {
        background-color: #f0f0f0;  
    }

    .filter-icon {
        color: #666666;
        font-size: 20px;
    }

    .search-input {
        background: transparent;
        border: none;
        color: #333333;
        padding: 4px;
        flex: 1;
        min-width: 200px;
    }

    .search-input::placeholder {
        color: #6c757d;
    }

    .close-button {
        background: transparent;
        border: none;
        color: #666666;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 18px;
    }

    .close-button:hover {
        color: #333333;
    }

    .empty-state {
        padding: 8px 12px;
        color: #666666;
        font-size: 14px;
    }

    .assignee-info {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }

    .assignee-name {
        font-family: monospace;
        font-size: 0.9em;
    }

    .dropdown-item input[type="checkbox"] {
        flex-shrink: 0;
    }

    .filter-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
    }

    .clear-button {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: none;
        color: #666666;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 3px;
    }

    .clear-button:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #333333;
    }

    .clear-button .material-icons {
        font-size: 14px;
    }

    .checkbox-text {
        color: #333333;
    }

    .empty-message {
        padding: 8px;
        color: #666666;
        text-align: center;
        font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
        .filter-bar {
            background: #333;
            border-bottom: 1px solid #444;
        }

        .filter-button {
            background: #333;
            border: 1px solid #444;
            color: #fff;
        }

        .filter-button.active {
            background: #444;
        }

        .dropdown-menu {
            background: #252526;
            border: 1px solid #454545;
            color: #cccccc;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .clear-filter {
            color: #cccccc;
        }

        .clear-filter:hover {
            background: #2a2d2e;
        }

        .dropdown-divider {
            background: #454545;
        }

        .filter-icon {
            color: #999;
        }

        .search-input {
            color: #fff;
        }

        .search-input::placeholder {
            color: #999;
        }

        .close-button {
            color: #999;
        }

        .close-button:hover {
            color: #fff;
        }

        .empty-state {
            color: #cccccc;
        }

        .clear-button {
            color: #666;
        }

        .clear-button:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .checkbox-text {
            color: #fff;
        }

        .empty-message {
            color: #cccccc;
        }

        .checkbox-label:hover {
            background-color: #2a2d2e; 
        }
    }
</style> 