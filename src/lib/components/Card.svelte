<script lang="ts">
    import { onMount } from 'svelte';
    import { ndkInstance, formatAmount } from '../ndk';
    import type { Card } from '../stores/kanban';
    import CardDetails from './CardDetails.svelte';
    import ZapModal from './ZapModal.svelte';
    import { formatTimeAgo, formatDateTime } from '../utils/date';
    import type { NDKKind, NDKUser } from '@nostr-dev-kit/ndk';
    import { getUserDisplayName, getUserDisplayNameByNip05 } from '../utils/user';
    import { kanbanStore } from '../stores/kanban';
    import type { KanbanBoard } from '../stores/kanban';
    import ContextMenu from './ContextMenu.svelte';
    import { createEventDispatcher } from 'svelte';
    import BoardSelectorModal from './BoardSelectorModal.svelte';

    const dispatch = createEventDispatcher(); 

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
    let creatorName = 'Unknown';
    let boards: KanbanBoard[] = []; 
    let selectedBoardId: string | null = null;
    let loadingBoards = false;
    let menuPosition = { x: 0, y: 0 };
    let activeMenu: string | null = null;
    let showBoardSelector = false;
    let targetBoardId: string | null = null; 

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

        const unsubKanban = kanbanStore.subscribe(state => {
            boards = state.myBoards;
        });

        return ()=> {
            unsubscribe();
            unsubKanban();
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

    async function getUserWithProfileFromPubKey(pubKey: string): Promise<NDKUser> {
        const user = ndkInstance.ndk!.getUser({pubkey: pubKey});
        await user.fetchProfile();
        return user;
    }

    function copyPermalink() {
        event.preventDefault();
        event.stopPropagation();
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

    function closeMenu() {
        activeMenu = null;
    }

    async function openMenu(event,cardId: string) {
        if (activeMenu && activeMenu !== cardId) {
            activeMenu = null;
        }

        activeMenu = cardId;

        // Calculate the correct position for the context menu
        let menuWidth = 200; // You can adjust this value based on your context menu width
        let menuHeight = 150; // Same for height
        let xPos = event.clientX;
        let yPos = event.clientY;

        // Prevent the menu from overflowing the viewport horizontally
        if (xPos + menuWidth > window.innerWidth) {
            xPos = window.innerWidth - menuWidth;
        }

        // Prevent the menu from overflowing the viewport vertically
        if (yPos + menuHeight > window.innerHeight) {
            yPos = window.innerHeight - menuHeight;
        }

        menuPosition = { x: xPos, y: yPos };
        menuPosition = { x: event.clientX, y: event.clientY };

        event.preventDefault();
        event.stopPropagation();
    }

        function openBoardSelector() {
        showBoardSelector = true;
    }

    function closeBoardSelector() {
        showBoardSelector = false;
    }

    async function handleBoardSelect(id: string) {
        targetBoardId = id; 

        try {
            await kanbanStore.copyCardToBoard(boardId, card, targetBoardId);
            closeBoardSelector(); 
        } catch (error) {
            console.error('Failed to copy card:', error);
        }
    }

    async function copyCard() {
        event.preventDefault();
        event.stopPropagation();

        openBoardSelector();
    }

    function handleMenuSelect(item) {
        const action = item.detail;  // Get the action from event.detail

        if (action === 'copy') {
            console.log("copy action invoked")
            copyCard();
        }else if (action === 'copyPermalink') {
            copyPermalink();
        }
        closeMenu();
        dispatch('menuSelect', item);
    }

    const menuItems = [
        { label: 'Copy Card',icon: 'content_copy', action: 'copy'  },
        {
            label: copySuccess ? 'Copied!' : 'Copy Permalink',
            icon: copySuccess ? 'check' : 'link',
            action: 'copyPermalink'
        }
    ];
</script>

<div 
    class="card" 
    draggable="true"
    on:click={openDetails}
    on:dragstart={handleDragStart}
    on:contextmenu={(e) => openMenu(e, card.id)}
>
    <div class="card-header">
        <h4 on:click={openDetails}>{card.title}</h4>
            <button on:click|preventDefault|stopPropagation={(e) => openMenu(e, card.id)}
                class="more-options-btn">
                <span class="material-icons">more_vert</span> 
            </button>
    </div>

    <div class="card-meta">
        <div class="creator-info" title="Creator">
            🪄 {creatorName}<a class="profile-link" href={`https://primal.net/p/${card.pubkey}`} target="_blank" title="Visit profile">🔗</a>
        </div>
        {#if lastUpdated}
            <div class="last-updated" title={'Last updated at ' + fullDateTime}>
            🕑 {lastUpdated}
            </div>
        {/if}
    </div>

    <div class="card-footer" on:click={openDetails}>
        {#if hasAssigneesOrAttachments}            
            <div class="footer-row">
                {#if card.assignees && card.assignees.length > 0}
                    <div class="assignees">
                        {#each card.assignees as assignee}
                            {#await getUserDisplayName(assignee)}
                                <span class="assignee">Loading...</span>
                            {:then name}
                                <span class="assignee">{name}</span>
                            {:catch}
                                <span class="assignee">Anonymous</span>
                            {/await}
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

    {#if activeMenu === card.id}
        <ContextMenu
            items={menuItems}
            position={menuPosition}
            visible={true}
            on:select={handleMenuSelect}
            on:close={closeMenu}
        />
    {/if}
     <BoardSelectorModal
                boards={boards.filter(board => board.id !== boardId)} 
                visible={showBoardSelector}
                onClose={closeBoardSelector}
                on:select={e => handleBoardSelect(e.detail)}
            />
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
        position: relative;
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
        justify-content: space-between;
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
        max-width: 100%;
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
        font-size: 0.75rem;
        color: #666;
        margin-bottom: 0.5rem;
        font-style: italic;
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

    .dropdown-menu {
        position: absolute;
        top: 100%;
        right: 0;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 10;
        width: 200px;
    }

    .board-list {
        max-height: 200px;
        overflow-y: auto;
    }

    .copy-btn {
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        width: 100%;
    }

    
    .context-menu {
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 10;
    }

    .context-menu-item {
        padding: 0.5rem 1rem;
        cursor: pointer;
    }

    .context-menu-item:hover {
        background: #f5f5f5;
    }

    .context-menu {
        top: var(--context-menu-top);
        left: var(--context-menu-left);
    }

</style> 