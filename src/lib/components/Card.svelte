<script lang="ts">
    import { onMount } from 'svelte';
    import { ndkInstance, formatAmount } from '../ndk';
    import { kanbanStore, type Card } from '../stores/kanban';
    import CardDetails from './CardDetails.svelte';
    import ZapModal from './ZapModal.svelte';
    import { formatTimeAgo, formatDateTime } from '../utils/date';
    import type { NDKKind, NDKUser } from '@nostr-dev-kit/ndk';
    import UserAvatar from './UserAvatar.svelte';

    export let card: Card;
    export let boardId: string;
    export let boardPubkey: string;
    export let isUnmapped: boolean = false;    
    export let showDetails: boolean = false;
    export let isNoZapBoard: boolean = false;
    export let readOnly: boolean = false;

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

        // subscribe to kanban store and update the card
        const kanbanUnsub = kanbanStore.subscribe((state) => {
            const cardsInBoard = state.cards.get(boardId);
            const cardsWithSameDTag = cardsInBoard?.filter(c => c.dTag === card.dTag);
            if (cardsWithSameDTag) {
                let latestCard = cardsWithSameDTag.sort((a, b) => b.created_at - a.created_at)[0];
                card = latestCard
                console.log('Card updated:', card);
            }
        });

        return  () => {
                unsubscribe();
                kanbanUnsub();
        };
    });

    // This can be used for likes, comments, etc.
    $: canReactOnCard = currentUser && 
                 loginMethod !== 'readonly' && 
                 loginMethod !== 'npub';

    // Add this computed property
    $: lastUpdated = card.created_at ? formatTimeAgo(card.created_at) : '';

    // Add this computed property
    $: fullDateTime = card.created_at ? formatDateTime(card.created_at) : '';

    // Add this computed property for assignees display
    $: hasAssigneesOrAttachments = (card.assignees && card.assignees.length > 0) || 
                                  (card.attachments && card.attachments.length > 0);

    function zapComplete(){
        loadZapAmount();
    }

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

    async function handleZap(event: MouseEvent) {
        event.stopPropagation(); // Prevent card details from opening
        showZapModal = true;
    }

    async function executeZap(amount: number, comment: string) {
        try {
            console.log('Zapping', amount, 'sats to', card.pubkey, 'with comment:', comment);
            await ndkInstance.zapCard(card, amount, comment, zapComplete);
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
    draggable={!readOnly}
    on:click={openDetails}
    on:dragstart={handleDragStart}
>
    <div class="card-header">
        <h4 on:click={openDetails}>{card.title}</h4>
        <div class="card-actions">
            {#if card.assignees && card.assignees.length > 0}
            {#each card.assignees as assignee}
                        <UserAvatar pubkey={assignee} size={24} prefix="Assigned to: "/>
            {/each}
            {/if}
            
        </div>
    </div>

    <div class="card-meta">
       {#if lastUpdated}
            <div class="last-updated" title={'Last updated at ' + fullDateTime}>
                <UserAvatar pubkey={card.pubkey} size={20} prefix="Last updated by: "/> <span class="last-updated-time">{lastUpdated}</span>
            </div>
        {/if}
    </div>

    <div class="card-footer" on:click={openDetails}>
        
        <div class="footer-row actions-row">
            {#if !isNoZapBoard}
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
            {/if}
            
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
</div>

{#if showDetails}
    <CardDetails {card} {boardId} {isUnmapped} onClose={closeDetails} {readOnly}/>
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
    
    .profile-link:hover{
        font-weight: bold;
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
        justify-content: flex-start;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
    }

    .footer-row:not(:last-child) {
        margin-bottom: 0.5rem;
    }

    .actions-row {
    }

    .zap-container {
        display: flex;
        align-items: center;
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
        

        .zap-button {
            background: #2d2d2d;
        }
    }

    .assignees {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
    }

    .assignee {
        background: #e3e9f3;
        padding: 0.2rem 0.4rem;
        border-radius: 3px;
        font-size: 0.75rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 150px;  /* Limit width of each assignee tag */
    }

    @media (prefers-color-scheme: dark) {
        .assignee {
            background: #2d2d2d;
            color: #e3e9f3;
        }
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

    .last-updated {
        display:flex;
        gap:0.25rem;        
        flex-wrap: wrap;
        font-size: 0.75rem;
        color: #666;
        margin-bottom: 0.5rem;
        font-style: italic;
    }

    .last-updated-time {
        padding:0.1rem;
    }

    @media (prefers-color-scheme: dark) {
        .last-updated {
            color: #999;
        }
    }

    .card-meta {
        font-size: 0.75rem;
        color: #666;
        margin-bottom: 0.5rem;
       

    }

    .creator-info {
        font-style: italic;
        margin-bottom: 0.25rem;
    }

    @media (prefers-color-scheme: dark) {
        .card-meta {
            color: #999;
        }
    }

    .creator-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-left: auto;
    }

    .assignees {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
    }

    .card-footer {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    
</style> 