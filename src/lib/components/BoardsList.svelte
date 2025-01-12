<script lang="ts">
    import { onMount } from 'svelte';
    import { push } from 'svelte-spa-router';
    import { ndkInstance, type LoginMethod } from '../ndk';
    import { BoardListType, kanbanStore } from '../stores/kanban';
    import type { KanbanBoard } from '../stores/kanban';
    import { NDKUser } from '@nostr-dev-kit/ndk';
    import CreateBoard from './CreateBoard.svelte';
    import AlertModal from './AlertModal.svelte';
    import { getUserWithProfileFromPubKey } from '../utils/user';
    import UserAvatar from './UserAvatar.svelte';

    let showCreateBoard = false;
    let boards: KanbanBoard[] = [];
    let myBoards: KanbanBoard[] = [];
    let maintainingBoards: KanbanBoard[] = [];
    let loading = false;
    let currentUser: NDKUser | null = null;
    let currentLoginMethod: LoginMethod | null = null;
    let copySuccess: { [key: string]: boolean } = {};
    let copyTimeouts: { [key: string]: NodeJS.Timeout } = {};
    let errorMessage: string | null = null;

    interface EditState {
        boardId: string;
        field: 'title' | 'description';
        value: string;
    }

    let editState: EditState | null = null;

    // Add tab state
    let activeTab: 'my-boards' | 'maintaining-boards' |'all-boards' = 'my-boards';
    
    // Computed property for filtered boards
    $: filteredBoards = activeTab === 'my-boards' ? myBoards : activeTab === 'maintaining-boards' ? maintainingBoards : boards;

    // Add a Map to store user display names
    let creatorNames = new Map<string, string>();

    // Add this to track Map updates
    let creatorNamesVersion = 0;

    async function switchTab(tab: 'my-boards' | 'maintaining-boards' |'all-boards') {
        try {
            activeTab = tab;
            loading = true;
            errorMessage = null;
            
            if (tab === 'my-boards') {
                await kanbanStore.loadBoards(BoardListType.MyBoards);
            } else if (tab === 'maintaining-boards') {
                await kanbanStore.loadBoards(BoardListType.MaintainingBoards);
            } 
            else {
                await kanbanStore.loadBoards();
            }
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to load boards';
        }
    }

    onMount(() => {
        const initialize = async () => {
            const unsubNDK = ndkInstance.store.subscribe(state => {
                currentUser = state.user;
                currentLoginMethod = state.loginMethod;
                
                if (state.isReady) {
                    if(!kanbanStore.hasNDK()){
                        kanbanStore.init(ndkInstance.ndk!);
                    }
                    // Load my boards by default
                    kanbanStore.loadBoards(BoardListType.MyBoards);
                }
            });

            // Subscribe to kanban store updates
            const unsubKanban = kanbanStore.subscribe(state => {
                boards = state.boards;
                myBoards = state.myBoards;
                maintainingBoards = state.maintainingBoards;
                loading = state.loading;
                errorMessage = state.error;
            });

            return () => {
                unsubNDK();
                unsubKanban();
            };
        };

        initialize();
    });


    function handleLogout() {
        kanbanStore.clearStore();
        ndkInstance.logout();
    }

    function handleBoardClick(pubkey: string, boardId: string) {
        push(`/board/${pubkey}/${boardId}`);
    }

    function copyBoardPermalink(board: KanbanBoard, event: MouseEvent) {
        event.stopPropagation();
        
        // Clear any existing timeout for this board
        if (copyTimeouts[board.id]) {
            clearTimeout(copyTimeouts[board.id]);
        }

        const permalink = `${window.location.origin}/#/board/${board.pubkey}/${board.id}`;
        
        navigator.clipboard.writeText(permalink).then(() => {
            copySuccess[board.id] = true;
            copyTimeouts[board.id] = setTimeout(() => {
                copySuccess[board.id] = false;
            }, 2000);
        });
    }

    function startEdit(board: KanbanBoard, field: 'title' | 'description', event: MouseEvent) {
        event.stopPropagation();
        editState = {
            boardId: board.id,
            field,
            value: field === 'title' ? board.title : board.description
        };
    }

    async function handleEdit(board: KanbanBoard, event: Event) {
        if (!editState) return;

        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        const newValue = target.value.trim();
        
        if (newValue && newValue !== (editState.field === 'title' ? board.title : board.description)) {
            try {
                await kanbanStore.updateBoard({
                    ...board,
                    [editState.field]: newValue
                });
            } catch (error) {
                errorMessage = error instanceof Error ? error.message : 'Failed to update board';
            }
        }
        editState = null;
    }

    function handleKeyDown(board: KanbanBoard, event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            handleEdit(board, event);
        } else if (event.key === 'Escape') {
            editState = null;
        }
    }

    // Function to load creator names
    async function loadCreatorName(pubkey: string) {
        if (!creatorNames.has(pubkey)) {
            try {
                const user = await getUserWithProfileFromPubKey(pubkey);
                creatorNames.set(pubkey, user.profile?.name || 'Anonymous');
                creatorNamesVersion += 1;
            } catch (error) {
                console.error('Failed to load user profile:', error);
                creatorNames.set(pubkey, 'Anonymous');
                creatorNamesVersion += 1;
            }
        }
        return creatorNames.get(pubkey);
    }

    $: {
        if (creatorNamesVersion || filteredBoards.length) {
            filteredBoards.forEach(board => {
                loadCreatorName(board.pubkey);
            });
        }
    }

</script>

<div class="boards-list">
    <header>
        <div class="header-left">
            <h1>Kanbanstr</h1>
            {#if currentLoginMethod === 'npub' || currentLoginMethod === 'readonly'}
                <span class="read-only-badge">Read Only</span>
            {/if}
        </div>
        <div class="header-right">            
            <a href="#/settings" class="settings-link">Settings</a>
            {#if currentLoginMethod !== 'npub' && currentLoginMethod !== 'readonly'}
                <button on:click={() => showCreateBoard = true}>Create Board</button>
            {/if}
            <button class="logout" on:click={handleLogout}>Logout</button>
        </div>
    </header>
    <div class="user-npub">Welcome {currentUser?.profile?.displayName || 'anonymous' }!!!</div>

    <!-- Add tabs -->
    <div class="tabs">
        <button 
            class="tab-button" 
            class:active={activeTab === 'my-boards'}
            on:click={() => switchTab('my-boards')}
        >
            My Boards
        </button>
        <button 
            class="tab-button" 
            class:active={activeTab === 'maintaining-boards'}
            on:click={() => switchTab('maintaining-boards')}
        >
            Boards I Maintain
        </button>
        <button 
            class="tab-button" 
            class:active={activeTab === 'all-boards'}
            on:click={() => switchTab('all-boards')}
        >
            All Boards
        </button>
    </div>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else if filteredBoards.length === 0}
        <div class="empty">
            {#if activeTab === 'my-boards'}
                <p>You haven't created any boards yet. {currentLoginMethod !== 'npub' && currentLoginMethod !== 'readonly' ? 'Create your first board!' : ''}</p>
            {:else if activeTab === 'maintaining-boards'}
                <p>You are not maintaining any boards.</p>
            {:else}
                <p>No boards found.</p>
            {/if}
        </div>
    {:else}
        <div class="boards-grid">
            {#each filteredBoards as board (board.id)}
                <div 
                    class="board-card" 
                    on:click={() => handleBoardClick(board.pubkey, board.id)}
                >
                    <div class="board-header">
                        <div class="title-section">
                            {#if editState?.boardId === board.id && editState.field === 'title'}
                                <input
                                    type="text"
                                    value={editState.value}
                                    on:blur={(e) => handleEdit(board, e)}
                                    on:keydown={(e) => handleKeyDown(board, e)}
                                    autofocus
                                />
                            {:else}
                                <h3>{board.title}</h3>
                                <button 
                                    class="edit-button" 
                                    on:click={(e) => startEdit(board, 'title', e)}
                                    title="Edit title"
                                >
                                    ✎
                                </button>
                            {/if}
                        </div>
                        <button 
                            class="permalink-button" 
                            on:click={(e) => copyBoardPermalink(board, e)}
                            title="Copy permalink"
                        >
                            {#if copySuccess[board.id]}
                                ✓
                            {:else}
                                🔗
                            {/if}
                        </button>
                    </div>
                    
                    <div class="description-section">
                        {#if editState?.boardId === board.id && editState.field === 'description'}
                            <textarea
                                value={editState.value}
                                on:blur={(e) => handleEdit(board, e)}
                                on:keydown={(e) => handleKeyDown(board, e)}
                                rows="3"
                                autofocus
                            />
                        {:else}
                            <p>{' ' + (board.description || 'No description')}</p>
                            <button 
                                class="desc-edit-button" 
                                on:click={(e) => startEdit(board, 'description', e)}
                                title="Edit description"
                            >
                                ✎
                            </button>
                        {/if}
                    </div>
                    <div class="creator-info">
                        Creator: <UserAvatar pubkey={board.pubkey} size={24} prefix="Creator: "/>
                        ♦ Maintainers:
                         {#each board.maintainers as maintainer}
                        <UserAvatar pubkey={maintainer} size={24} prefix="Maintainer: "/>
                        {/each}
                        {#if board.maintainers.length === 0}
                            <span>None</span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {/if}

    {#if showCreateBoard}
        <CreateBoard onClose={() => showCreateBoard = false} />
    {/if}

    {#if errorMessage}
        <AlertModal 
            message={errorMessage} 
            onClose={() => errorMessage = null} 
        />
    {/if}
</div>

<style>
    .boards-list {
        padding: 0rem;
    }

    .boards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
        gap: 1.5rem;
        padding-top: 0.5rem;
    }

    button {
        padding: 0.75rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .board-card {
        background: white;
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
    }

    .board-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }

    .board-card h3 {
        margin: 0 0 0.5rem 0;
    }

    .board-card p {
        margin: 0;
        color: #666;
        font-size: 0.9rem;
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        padding-left: 0rem;
    }

    .board-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0rem;
        margin-bottom: 0.5rem;
    }

    .board-header h3 {
        margin: 0;
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

    .title-section, .description-section {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
    }

    .edit-button , .desc-edit-button {
        background: none;
        color: #666;
        border: none;
        padding: 0.2rem;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0;
        transition: opacity 0.2s;
    }

    .desc-edit-button {
        padding: 0rem;
        
    }


    .title-section:hover .edit-button, 
    .description-section:hover .desc-edit-button {
        opacity: 0.6;
    }

    .edit-button:hover, .desc-edit-button:hover {
        opacity: 1 !important;
    }

    input, textarea {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-family: inherit;
        font-size: inherit;
        background: white;
    }

    textarea {
        resize: vertical;
        min-height: 60px;
    }

    

    .header-left h1{
        margin-top: 0;
        margin-bottom: 0.5rem;    
    }

    h1 {
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .read-only-badge{
        background: #c06c6c;
        color: #fafafa;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
    }

    .tabs {
        display: flex;
        gap: 1rem;
        margin-top: 1rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid #ddd;
        padding-bottom: 0.5rem;
    }

    .tab-button {
        background: none;
        border: none;
        padding: 0.5rem 1rem;
        cursor: pointer;
        font-size: 1rem;
        color: #666;
        border-radius: 4px 4px 0 0;
        transition: all 0.2s ease;
    }

    .tab-button:hover {
        color: #333;
        background: #f5f5f5;
    }

    .tab-button.active {
        color: #0052cc;
        border-bottom: 2px solid #0052cc;
        font-weight: 500;
    }

    @media (prefers-color-scheme: dark) {
        .boards-grid {
                color: #333;
        }

        .edit-button {
            color: #333;
        }

        input, textarea {
            border: 1px solid #333;
            color: #333;
        }
        
        .tab-button {
            color: #999;
        }

        .tab-button:hover {
            color: #fff;
            background: #2d2d2d;
        }

        .tab-button.active {
            color: #66b2ff;
            border-bottom-color: #66b2ff;
        }

        .tabs {
            border-bottom-color: #333;
        }
    }

    .creator-info {
        display: flex;
        justify-content: flex-start;
        gap: 0.25rem;
        font-size: 0.9rem;
        color: #666;
        padding-top: 0.5rem;
        margin-bottom: 0.5rem;
        font-style: italic;
    }

    @media (prefers-color-scheme: dark) {
        .creator-info {
            color: #999;
        }
    }

    .settings-link {
        padding: 0.75rem;
        color: #0052cc;
        text-decoration: none;
        border-radius: 4px;
    }

    .settings-link:hover {
        background: rgba(0, 82, 204, 0.1);
    }

    .board-meta {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: 0.5rem 0;
        flex-wrap: wrap;
    }

    .owner-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: #666;
        font-size: 0.9rem;
    }

    .maintainers-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .maintainers-info .label {
        color: #666;
        font-size: 0.9rem;
    }

    .maintainers-avatars {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
        align-items: center;
    }

    @media (prefers-color-scheme: dark) {
        .owner-info {
            color: #999;
        }

        .maintainers-info .label {
            color: #999;
        }
    }
</style> 