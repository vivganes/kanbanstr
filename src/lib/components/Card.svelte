<script lang="ts">
    import type { Card } from '../stores/kanban';
    import CardDetails from './CardDetails.svelte';

    export let card: Card;
    export let boardId: string;
    export let boardPubkey: string;
    export let isUnmapped: boolean = false;    
    export let showDetails: boolean = false;

    let copySuccess = false;
    let copyTimeout: NodeJS.Timeout;

    function copyPermalink() {
        if (copyTimeout) clearTimeout(copyTimeout);

        const permalink = `${window.location.origin}/#/board/${boardPubkey}/${boardId}/${card.pubkey}/${card.id}`;
        
        navigator.clipboard.writeText(permalink).then(() => {
            copySuccess = true;
            copyTimeout = setTimeout(() => {
                copySuccess = false;
            }, 2000);
        });
    }

    function openDetails() {
        showDetails = true;
    }

    function closeDetails() {
        showDetails = false;
    }

    function handleDragStart(event: DragEvent) {
        if (!event.dataTransfer) return;
        
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/json', JSON.stringify({
            cardId: card.id,
            sourceStatus: card.status,
            order: card.order
        }));
    }

    // Function to format pubkey for display
    function formatPubkey(pubkey: string): string {
        return pubkey.slice(0, 4) + '...' + pubkey.slice(-4);
    }
</script>

<div 
    class="card" 
    draggable="true"
    on:click={openDetails}
    on:dragstart={handleDragStart}
>
    <div class="card-header">
        <h4 on:click={openDetails}>{card.title}</h4>
        <button 
            class="permalink-button" 
            on:click|stopPropagation={copyPermalink}
            title="Copy permalink"
        >
            {#if copySuccess}
                ✓
            {:else}
                🔗
            {/if}
        </button>
    </div>

    <div class="card-footer" on:click={openDetails}>
        {#if card.assignees && card.assignees.length > 0}
            <div class="assignees">
                {#each card.assignees as assignee}
                    <span class="assignee">{formatPubkey(assignee)}</span>
                {/each}
            </div>
        {/if}
        {#if card.attachments && card.attachments.length > 0}
            <div class="attachments">
                <span>📎 {card.attachments.length}</span>
            </div>
        {/if}
    </div>
</div>

{#if showDetails}
    <CardDetails {card} {boardId} {isUnmapped} onClose={closeDetails} />
{/if}

<style>
    .card {
        background: white;
        border-radius: 4px;
        padding: 0.8rem;
        margin-bottom: 0.5rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12);
        cursor: pointer;
        user-select: none;
    }

    .card:hover {
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    .card:active {
        cursor: grabbing;
    }

    h4 {
        margin: 0 0 0.5rem 0;
        text-align: left;
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.5rem;
        font-size: 0.8rem;
        color: #666;
    }

    .assignees {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .assignee {
        background: #e3e9f3;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
        font-family: monospace;
        font-size: 0.75rem;
    }

    .attachments {
        white-space: nowrap;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .card-header h4 {
        flex: 1;
        margin: 0 0 0.5rem 0;
        text-align: left;
        cursor: pointer;
    }

    .permalink-button {
        background: none;
        border: none;
        padding: 0.2rem;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0.6;
        border-radius: 4px;
        transition: opacity 0.2s, background-color 0.2s;
    }

    .permalink-button:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.05);
    }
</style> 