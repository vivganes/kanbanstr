<script lang="ts">
    import { onMount } from 'svelte';
    import { push } from 'svelte-spa-router';
    import { ndkInstance, type LoginMethod } from '../ndk';
    import { kanbanStore } from '../stores/kanban';
    import type { KanbanBoard } from '../stores/kanban';
    import { NDKUser } from '@nostr-dev-kit/ndk';
    import CreateBoard from './CreateBoard.svelte';
    import AlertModal from './AlertModal.svelte';

    let showCreateBoard = false;
    let boards: KanbanBoard[] = [];
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

    onMount(() => {
        const initialize = async () => {
            const unsubNDK = ndkInstance.store.subscribe(state => {
                currentUser = state.user;
                currentUser?.fetchProfile();
                console.log("Current User:" + currentUser?.profile?.displayName);
                currentLoginMethod = state.loginMethod;
                
                if (state.isReady) {
                    initializeApp();
                }
            });

            return unsubNDK;
        };

        initialize();
        return () => {};
    });

    async function initializeApp() {
        try {
            console.log("NDK:" + ndkInstance.ndk);
            if(!ndkInstance.ndk) {
                throw new Error('NDK not initialized');
            }
            await kanbanStore.init(ndkInstance.ndk!);
            
            await kanbanStore.loadBoards();
            
            const unsubscribe = kanbanStore.subscribe(state => {
                boards = state.boards;
                loading = state.loading;
                errorMessage = state.error;
            });

            return unsubscribe;
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        }
    }

    function handleLogout() {
        ndkInstance.logout();
    }

    async function  getCurrentUserName() {
        return currentUser?.profile?.displayName;
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

</script>

<div class="boards-list">
    <header>
        <div class="header-left">
            <h1>Kanbanstr</h1>
            {#if currentLoginMethod === 'npub' || currentLoginMethod === 'readonly'}
                <span class="read-only-badge">Read Only</span>
            {/if}
        </div>
        
    </header>
    <div class="header-right">
        <div class="user-npub">Welcome {currentUser?.profile?.displayName || 'anonymous' }!!!</div>
        {#if currentLoginMethod !== 'npub' && currentLoginMethod !== 'readonly'}
            <button on:click={() => showCreateBoard = true}>Create Board</button>
        {/if}
        <button class="logout" on:click={handleLogout}>Logout</button>
    </div>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else if boards.length === 0}
        <div class="empty">
            <p>No boards found. {currentLoginMethod !== 'npub' && currentLoginMethod !== 'readonly' ? 'Create your first board!' : ''}</p>
        </div>
    {:else}
        <div class="boards-grid">
            {#each boards as board (board.id)}
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
                            <p>{board.description}</p>
                            <button 
                                class="edit-button" 
                                on:click={(e) => startEdit(board, 'description', e)}
                                title="Edit description"
                            >
                                ✎
                            </button>
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

    .edit-button {
        background: none;
        border: none;
        padding: 0.2rem;
        cursor: pointer;
        font-size: 1rem;
        opacity: 0;
        transition: opacity 0.2s;
    }

    .title-section:hover .edit-button,
    .description-section:hover .edit-button {
        opacity: 0.6;
    }

    .edit-button:hover {
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

    .description-section p {
        flex: 1;
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
        
    }
</style> 