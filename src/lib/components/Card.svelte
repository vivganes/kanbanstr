<script lang="ts">
    import { onMount } from 'svelte';
    import { ndkInstance, formatAmount } from '../ndk';
    import type { Card } from '../stores/kanban';
    import CardDetails from './CardDetails.svelte';
    import ZapModal from './ZapModal.svelte';
    import type { NDKKind } from '@nostr-dev-kit/ndk';

    export let card: Card;
    export let boardId: string;
    export let boardPubkey: string;
    export let isUnmapped: boolean = false;    
    export let showDetails: boolean = false;

    let copySuccess = false;
    let copyTimeout: NodeJS.Timeout;
    let isZapping = false;
    let zapError: string | null = null;
    let showZapModal = false;
    let zapAmount = 0;
    let isWebLnEnabled = window.hasOwnProperty('webln');

    let currentUser: any = null;
    let loginMethod: string | null = null;
    let zapMethod = undefined;
    let canUserZap = false;
    let zapImpossibleReason: string|undefined = undefined;

    onMount(() => {
        const unsubscribe = ndkInstance.store.subscribe(state => {
            currentUser = state.user;
            loginMethod = state.loginMethod;
            zapMethod = state.zapMethod;

            if(zapMethod === 'nwc'){
                canUserZap = true;
            } else if(zapMethod === 'webln') {
                if(isWebLnEnabled){
                    canUserZap= true;
                    zapImpossibleReason = undefined;
                } else {
                    zapImpossibleReason = "WebLN is not enabled. So, you cannot zap!"
                }
            } else {
                zapImpossibleReason = "Zap method not configured. Configure it in settings to zap!"
            }
        });

        return {
            unsubscribe
        };
    });

    // This can be used for likes, comments, etc.
    $: canReactOnCard = currentUser && 
                 loginMethod !== 'readonly' && 
                 loginMethod !== 'npub';



    function copyPermalink() {
        if (copyTimeout) clearTimeout(copyTimeout);

        const permalink = `${window.location.origin}/#/board/${boardPubkey}/${boardId}/${card.pubkey}/${card.dTag}`;
        
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

    async function handleZap(event: MouseEvent) {
        event.stopPropagation(); // Prevent card details from opening
        showZapModal = true;
    }

    async function executeZap(amount: number, comment: string) {
        try {
            await ndkInstance.zapCard(card, amount, comment);
        } catch (error) {
            throw error;
        }
    }

    // Add this function to load zap amount
    async function loadZapAmount() {
        try {
            zapAmount = await ndkInstance.getZapAmount(30302 as NDKKind,card.pubkey,card.dTag);
        } catch (error) {
            console.error('Failed to load zap amount:', error);
        }
    }

    // Call it when the component mounts
    onMount(() => {
        loadZapAmount();
    });
</script>

<div 
    class="card" 
    draggable="true"
    on:click={openDetails}
    on:dragstart={handleDragStart}
>
    <div class="card-header">
        <h4 on:click={openDetails}>{card.title}</h4>
        <div class="card-actions">
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
    </div>

    <div class="card-footer" on:click={openDetails}>
        {#if !(!card.assignees || card.assignees.length === 0) && (!card.attachments || card.attachments.length === 0)}            
        <div class="footer-row">
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
        {/if}
        <div class="footer-row actions-row">
            <div class="zap-container">
                {#if !isZapping}
                    <button 
                        class="zap-button" 
                        on:click={handleZap}
                        disabled={!canUserZap}
                        title={canUserZap ? "Send sats via Lightning": zapImpossibleReason}
                    >
                        ⚡
                        {#if zapAmount > 0}
                            <span class="zap-amount">{formatAmount(zapAmount)}</span>
                        {/if}
                    </button>
                {:else}                 
                    <button 
                        class="zap-button pulse-animation" 
                        disabled
                        title="Sending sats..."
                    >
                        ⚡
                        {#if zapAmount > 0}
                            <span class="zap-amount">{formatAmount(zapAmount)}</span>
                        {/if}
                    </button>
                {/if}
            </div>
        </div>
    </div>
</div>

{#if showDetails}
    <CardDetails {card} {boardId} {isUnmapped} onClose={closeDetails} />
{/if}

{#if zapError}
    <div class="error-message">
        {zapError}
    </div>
{/if}

{#if showZapModal}
    <ZapModal 
        onClose={() => showZapModal = false}
        onZap={executeZap}
    />
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
        word-wrap: break-word;
        word-break: break-word;
    }

    .card-footer {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
        font-size: 0.8rem;
        color: #666;
    }

    .footer-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .actions-row {
    }

    .zap-container {
        display: flex;
        align-items: center;
        width: 100%;
    }

    .zap-button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.4rem;
        background: #f5f5f5;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
    }

    @media (prefers-color-scheme: dark) {
        .actions-row {
            border-top-color: #333;
        }

        .zap-button {
            background: #2d2d2d;
        }
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

    .card-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .zap-button {
        background: none;
        border: none;
        padding: 0.2rem;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0.6;
        border-radius: 4px;
        transition: opacity 0.2s, background-color 0.2s;
    }

    @keyframes pulse {
            0% {
                transform: scale(1);
            }

            50% {
                transform: scale(1.5);
            }

            100% {
                transform: scale(1);
            }
        }

    .pulse-animation {
        animation: pulse 1s infinite;
    }


    .zap-button:hover:not(:disabled) {
        opacity: 1;
        background: rgba(132, 0, 255, 0.1);
    }

    .zap-button:hover:is(:disabled) {
        background: rgba(132, 0, 255, 0.1);
    }

    .zap-button:disabled {
        cursor: not-allowed;
    }

    .error-message {
        color: #ff4444;
        font-size: 0.8rem;
        margin-top: 0.5rem;
        padding: 0.5rem;
        background: rgba(255, 68, 68, 0.1);
        border-radius: 4px;
    }

    @media (prefers-color-scheme: dark) {

        .permalink-button{
            color:#333;
        }


        .zap-button:hover:not(:disabled) {
            background: rgba(255, 215, 0, 0.2);
        }
    }

    .zap-amount {
        font-size: 0.8rem;
        color: #1e1855;
        font-weight: 500;
        padding-right: 0.5rem;
        margin-left: -0.25rem;
    }
</style> 