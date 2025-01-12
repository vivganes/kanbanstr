<script lang="ts">
    import { onMount } from 'svelte';
    import { kanbanStore } from '../stores/kanban';
    import type { KanbanBoard } from '../stores/kanban';
    import Board from './Board.svelte';
    import { ndkInstance } from '../ndk';
    import { push } from 'svelte-spa-router';

    export let params: { 
        id: string, 
        pubkey: string,
        cardpubkey?: string,
        cardDTag?: string 
    };
    
    let board: KanbanBoard | null = null;
    let loading = true;
    let error: string | null = null;
    let initialCardToOpen = params.cardDTag ? {
        pubkey: params.cardpubkey!,
        dTag: params.cardDTag
    } : undefined;

    onMount(() => {
        const initialize = async () => {
            try {
                const unsubscribe = ndkInstance.store.subscribe((state) => {
                    if (state.isReady) {
                        if(!kanbanStore.hasNDK()){
                            kanbanStore.init(ndkInstance.ndk!);
                            loadBoard();
                        } else {
                            loadBoard();
                        }
                    }
                });

                return unsubscribe;
            } catch (e) {
                error = 'Failed to load board';
                loading = false;
                return () => {};
            }
        };

        initialize();
        return () => {};
    });

    async function loadBoard() {
        try {
            board = await kanbanStore.loadBoardByPubkeyAndId(params.pubkey,params.id);
            if (!board) {
                error = 'Board not found';
            }
        } catch (e) {
            error = 'Failed to load board';
        } finally {
            loading = false;
        }
    }

    function handleBack() {
        push('/');
    }
</script>

<div class="board-view">
    <h1>Kanbanstr</h1>

    {#if loading}
        <div class="loading">Loading board...</div>
    {:else if error}
        <div class="error">
            <p>{error}</p>
            <button on:click={handleBack}>Return to Boards</button>
        </div>
    {:else if board}    
        <Board {board} {initialCardToOpen} />
    {/if}
</div>

<style>
    .board-view {
        height: 100vh;
    }

    h1{
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 1rem;
        margin-top: auto;
    }

    .loading, .error {
        text-align: center;
        padding: 2rem;
        color: #666;
    }

    .error button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    @media (prefers-color-scheme: dark) {
        .board-view {
            color: #333;
        }

        .back-button {
            background: #1e1855;           
        }

        .back-button:hover {
            background: #2e2955;
        }

    }
</style> 