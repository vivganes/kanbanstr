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
        cardId?: string 
    };
    
    let board: KanbanBoard | null = null;
    let loading = true;
    let error: string | null = null;
    let initialCardToOpen = params.cardId ? {
        pubkey: params.cardpubkey!,
        id: params.cardId
    } : undefined;

    onMount(() => {
        const initialize = async () => {
            try {
                // Wait for NDK to be ready if not already
                const unsubscribe = ndkInstance.store.subscribe((state) => {
                    if (state.isReady) {
                        if(!kanbanStore.hasNDK()){
                            kanbanStore.init(ndkInstance.ndk!);
                            loadBoard();
                            // kanbanStore.subscribe(state => {
                            //     if(state.loading === false){
                            //         loadBoard();
                            //     }
                            // });
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
        console.trace();
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
    <header>
        <h2>Kanbanstr</h2>
        <button class="back-button" on:click={handleBack}>&larr; Back to Boards</button>
    </header>

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

    h2{
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .back-button {
        padding: 0.5rem 1rem;
        background: #f4f5f7;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .back-button:hover {
        background: #e4e6e8;
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
</style> 