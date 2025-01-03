<script lang="ts">
    import { onMount } from 'svelte';

    let showModal = false;
    let checkboxes = {
        noStorage: false,
        publicRelays: false,
        publicData: false
    };

    const CONSENT_KEY = 'nostr_kanban_consent';

    onMount(() => {
        const hasConsented = localStorage.getItem(CONSENT_KEY);
        if (!hasConsented) {
            showModal = true;
        }
    });

    function handleConsent() {
        if (Object.values(checkboxes).every(value => value)) {
            localStorage.setItem(CONSENT_KEY, 'true');
            showModal = false;
        }
    }

    $: canConsent = Object.values(checkboxes).every(value => value);
</script>

{#if showModal}
    <div class="modal-backdrop">
        <div class="modal">
            <h2>Important Notice</h2>
            <p>Please read and acknowledge the following before using Kanbanstr:</p>
            
            <div class="checkbox-group">
                <label>
                    <input 
                        type="checkbox" 
                        bind:checked={checkboxes.noStorage}
                    >
                    <span>Kanbanstr does not store any data I create here, on its servers</span>
                </label>

                <label>
                    <input 
                        type="checkbox" 
                        bind:checked={checkboxes.publicRelays}
                    >
                    <span>The data I create is stored in public <a href="https://nostr.com/relays" target="_blank">nostr relays</a></span>
                </label>

                <label>
                    <input 
                        type="checkbox" 
                        bind:checked={checkboxes.publicData}
                    >
                    <span>The data I create here is public and visible to any <a href="https://nostr.com" target="_blank">nostr</a> user</span>
                </label>
            </div>

            <button 
                on:click={handleConsent}
                disabled={!canConsent}
            >
                I understand
            </button>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .modal {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        max-width: 500px;
        width: 90%;
    }

    .checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin: 2rem 0;
    }

    label {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        cursor: pointer;
    }

    input[type="checkbox"] {
        margin-top: 0.25rem;
    }

    button {
        width: 100%;
        padding: 0.75rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    @media (prefers-color-scheme: dark) {
        .modal {
            background: #2d2d2d;
            color: #ffffff;
        }
    }
</style> 