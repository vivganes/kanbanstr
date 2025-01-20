<script lang="ts">
    import { onMount } from 'svelte';
    import { ndkInstance, formatAmount } from '../ndk';
    import { kanbanStore, type Card, type KanbanBoard } from '../stores/kanban';
    import CardDetails from './CardDetails.svelte';
    import ZapModal from './ZapModal.svelte';
    import { formatTimeAgo, formatDateTime } from '../utils/date';
    import type { NDKKind, NDKUser } from '@nostr-dev-kit/ndk';
    import UserAvatar from './UserAvatar.svelte';
    import ContextMenu from './ContextMenu.svelte';
    import BoardSelectorModal from './BoardSelectorModal.svelte';
    import { toastStore } from '../stores/toast';
    import { activeContextMenuId } from '../stores/contextMenu';
    
    export let card: Card;
    export let boardId: string;
    export let boardPubkey: string;
    export let isUnmapped: boolean = false;    
    export let showDetails: boolean = false;
    export let isNoZapBoard: boolean = false;
    export let readOnly: boolean = false;

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
    let creatorName = 'Unknown';
    let boards: KanbanBoard[] = []; 
    let menuPosition = { x: 0, y: 0 };
    let showBoardSelectorForCloning = false; 
    let showBoardSelectorForTrackingInDifferentBoard = false;
    let showContextMenu = false;
    let contextMenuComponent: ContextMenu;    

    const contextMenuItems = [
        { label: 'Clone as new card', icon: 'content_copy', action: 'clone-as-new-card' },
        { label: 'Track this card in another board', icon: 'track_changes', action: 'track-card' },
        { label: 'Copy permalink', icon: 'link', action: 'copy-permalink' }
    ];

    let tTags = [...(card.tTags || [] )]; 
    let showAllTags = false;
    const additionalCount = tTags.length > 3 ? tTags.length - 3 : 0;

    onMount(async () => {   
        try {
            const creator = await getUserWithProfileFromPubKey(card.pubkey);
            creatorName = creator?.profile?.displayName || 'Anonymous';
        } catch (error) {
            console.error('Failed to load creator info:', error);
            creatorName = 'Anonymous';
        }
        
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
            }
            boards = state.myBoards;
        });

        return ()=> {
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

    function zapComplete(){
        loadZapAmount();
    }

    async function getUserWithProfileFromPubKey(pubKey: string): Promise<NDKUser> {
        const user = ndkInstance.ndk!.getUser({pubkey: pubKey});
        await user.fetchProfile();
        return user;
    }

    async function copyPermalink(event) {
        event.preventDefault();
        event.stopPropagation();

        const permalink = `${window.location.origin}/#/board/${boardPubkey}/${boardId}/card/${card.dTag}`;
        
        try {
            await navigator.clipboard.writeText(permalink);
            contextMenuComponent.setItemSuccess('copy-permalink');
            toastStore.addToast('Permalink copied to clipboard');
            
            setTimeout(() => {
                closeMenu();
            }, 500);
        } catch (error) {
            toastStore.addToast('Failed to copy permalink', 'error');
        }
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

    function openMenu(event: MouseEvent, cardId: string) {
        event.preventDefault();
        event.stopPropagation();
        if ($activeContextMenuId) {
            activeContextMenuId.set(null);
        }
        menuPosition = { x: event.clientX, y: event.clientY };
        showContextMenu = true;
    }

    function closeMenu() {
        showContextMenu = false;
        activeContextMenuId.set(null);
    }

     function closeBoardSelector() {
        showBoardSelectorForCloning = false;
        showBoardSelectorForTrackingInDifferentBoard = false;
    }

    async function handleBoardSelectForCloning(event) {
        const targetBoardId = event.detail;
        
        try {
            await kanbanStore.cloneCardToBoard(card, targetBoardId);
            showBoardSelectorForCloning = false;
            toastStore.addToast('Card cloned successfully as a new card');
        } catch (error) {
            console.error('Failed to copy card:', error);
            toastStore.addToast('Failed to clone card', 'error');
        }
    }

    async function handleBoardSelectForTrackingInDifferentBoard(event) {
        const targetBoardId = event.detail;
        
        try {
            await kanbanStore.trackCardInAnotherBoard(card, 
                `30301:${boardPubkey}:${boardId}`, 
                targetBoardId);
            showBoardSelectorForTrackingInDifferentBoard = false;
            toastStore.addToast('Card is now being tracked in the selected board');
        } catch (error) {
            console.error('Failed to track card in the selected board:', error);
            toastStore.addToast('Failed to track card in the selected board', 'error');
        }
    }

    async function cloneAsNewCard(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        
        showBoardSelectorForCloning = true;
        
        closeMenu();
    }

    async function trackCardInAnotherBoard(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        
        showBoardSelectorForTrackingInDifferentBoard = true;
        
        closeMenu();
    }

    function handleMenuSelect(event) {
        const action = event.detail;
        if (action === 'clone-as-new-card') {
            cloneAsNewCard(event);
        }
        else if (action === 'track-card') {
            trackCardInAnotherBoard(event);
        } 
        else if (action === 'copy-permalink') {
            copyPermalink(event);
        }
    }

    const toggleShowAll = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAllTags = !showAllTags;
    };
</script>

<div 
    class="card" 
    draggable={!readOnly && !(card.trackingRef !== undefined)}
    on:click={openDetails}
    on:dragstart={handleDragStart}
    on:contextmenu={(e) => openMenu(e, card.id)}
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
        <div>
            <!-- show icon if there is card has trackingRef -->
            {#if card.trackingRef}
            <button on:click|preventDefault|stopPropagation={(e) => null}
                class="track-icon">
                <span class="material-icons" title="Tracked card from another board">track_changes</span>
            </button>
                
            {/if}
        </div>
            <button on:click|preventDefault|stopPropagation={(e) => openMenu(e, card.id)}
                class="more-options-btn">
                <span class="material-icons">more_vert</span> 
            </button>
    </div>

    <div class="card-tag-div">
        {#if showAllTags}
            {#each tTags as tag}
                <p class="card-tag-text">{tag}</p>
            {/each}
            <p class="card-tag-text tags-show-less" on:click={toggleShowAll}>
                show Less
            </p>
        {:else}
            {#each tTags.slice(0, 3) as tag}
                <p class="card-tag-text">{tag}</p>
            {/each}
            {#if additionalCount > 0}
                <p class="card-tag-text tags-show-more" on:click={toggleShowAll}>
                    +{additionalCount}
                </p>
            {/if}
        {/if}
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
        </div>
    </div>

   {#if showContextMenu}
        <ContextMenu
            bind:this={contextMenuComponent}
            id={card.id}
            items={contextMenuItems}
            position={menuPosition}
            visible={showContextMenu}
            on:select={handleMenuSelect}
            on:close={closeMenu}
        />
    {/if}
     <BoardSelectorModal
                visible={showBoardSelectorForCloning}
                onClose={closeBoardSelector}
                on:select={handleBoardSelectForCloning}
            />
    <BoardSelectorModal
            visible={showBoardSelectorForTrackingInDifferentBoard}
            onClose={closeBoardSelector}
            on:select={handleBoardSelectForTrackingInDifferentBoard}
        />
</div>

{#if showDetails}
    <CardDetails {card} {boardId} {isUnmapped} onClose={closeDetails} readOnly={readOnly || (card.trackingRef !== undefined)}/>
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
        position: relative;
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

    .card-tag-div{
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
    }

    .card-tag-text{
        height: 1.5rem;
        min-width: 2.5rem;
        padding: 2px 10px;
        background-color: #cc00b1;
        border-radius: 5px;
        color: #2d2d2d;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: -1rem;
    }

    .tags-show-more {
    cursor: pointer;
    background-color: white;
    color: blue;
    }

    .tags-show-less {
        cursor: pointer;
        background-color: white;
        color: blue;
        font-size: 0.8rem;
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
        margin-top: 2rem; 
    }

    @media (prefers-color-scheme: dark) {
        .card-meta {
            color: #999;
        }
    }
    .card-footer {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    
    .more-options-btn {
        background: none;
        color:black;
        border: none;
        padding: 0.2rem;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0.6;
        border-radius: 4px;
        transition: opacity 0.2s, background-color 0.2s;
    }

    .more-options-btn:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.05);
    }

    .track-icon{
        background: none;
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        color:black;
        border: none;
        padding: 0.2rem;
        font-size: 1rem;
        cursor: auto;
        opacity: 0.9;
        border-radius: 4px;
        transition: opacity 0.2s, background-color 0.2s;
    }

    .track-icon:hover {
        opacity: 1;
        background: none;
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

</style> 