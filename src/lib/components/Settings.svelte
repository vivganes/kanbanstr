<script lang="ts">
    import { onMount } from 'svelte';
    import { ndkInstance } from '../ndk';
    import AlertModal from './AlertModal.svelte';
    import { push } from 'svelte-spa-router';

    let currentUser: any = null;
    let nwcString:string|null = null;
    let showSuccess = false;
    let errorMessage: string | null = null;
    let zapMethod: 'webln' | 'nwc' | undefined = undefined;
    let isWebLnAvailable = false;

    function handleBack() {
        push('/');
    }

    onMount(() => {
        // Check if WebLN is available
        isWebLnAvailable = window.hasOwnProperty('webln');

        const unsubscribe = ndkInstance.store.subscribe(state => {
            currentUser = state.user;
            nwcString = state.nwcString || null;
            zapMethod = state.zapMethod;
        });
    
        return () => {
            unsubscribe();
        };
    });

    async function handleNWCSubmit() {
        try {
            await ndkInstance.setNWCString(nwcString);
            showSuccess = true;
            setTimeout(() => {
                showSuccess = false;
            }, 2000);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to save NWC string';
        }
    }

    async function handleZapMethodChange(method: 'webln' | 'nwc' | undefined) {
        try {
            await ndkInstance.setZapMethod(method);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Failed to set zap method';
        }
    }
</script>

<div class="settings-container">
    <header>
        <a href="/" class="logo-link">
            <h1>Kanbanstr</h1>        
        </a>
    </header>
    <button class="back-button" on:click={handleBack}>&larr; Back to Boards</button>

    <div class="section">
        <h2>Profile Information</h2>
        <div class="profile-info">
            {#if currentUser?.profile?.image}
                <img 
                    src={currentUser.profile.image} 
                    alt="Profile" 
                    class="profile-image"
                />
            {/if}
            <div class="profile-details">
                <div class="field">
                    <label>Display Name</label>
                    <div class="value">{currentUser?.profile?.displayName || 'Not set'}</div>
                </div>
                <div class="field">
                    <label>Npub</label>
                    <div class="value monospace">{currentUser?.npub || 'Not available'}</div>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Zap Settings</h2>
        <p class="help-text">
            Choose how you want to send zaps:
        </p>
        <div class="zap-methods">
            <div>
                <label class="method-option">
                    <input 
                        type="radio" 
                        name="zapMethod" 
                        value="webln"
                        bind:group={zapMethod}
                        on:change={() => handleZapMethodChange('webln')}
                        disabled={!isWebLnAvailable}
                    >
                    <div class="method-content">
                        <span class="method-title">WebLN</span>
                        <span class="method-description">
                            {isWebLnAvailable ? 
                                'Use your browser extension wallet (like Alby) to send zaps' : 
                                'WebLN not available. Install a compatible browser extension like Alby'}
                        </span>
                    </div>
                </label>
            </div>
            <div>
                <label class="method-option">
                    <input 
                        type="radio" 
                        name="zapMethod" 
                        value="nwc"
                        bind:group={zapMethod}
                        on:change={() => handleZapMethodChange('nwc')}
                    >
                    <div class="method-content">
                        <span class="method-title">Nostr Wallet Connect</span>
                        <span class="method-description">Use Nostr Wallet Connect string to connect to your Lightning wallet</span>
                    </div>
                </label>
            </div>
        </div>

        {#if zapMethod === 'nwc'}
            <div class="nwc-section">
                <h3>Nostr Wallet Connect Setup</h3>
                <p class="help-text">
                    Paste your NWC string to enable zapping functionality. 
                    <a href="https://github.com/nostr-protocol/nips/blob/master/47.md" target="_blank">Learn more about NWC</a>
                </p>
                <form on:submit|preventDefault={handleNWCSubmit} class="nwc-form">
                    <div class="input-group">
                        <input
                            required
                            type="password"
                            bind:value={nwcString}
                            placeholder="Paste your NWC string here"
                        />
                        <button type="submit">Save</button>
                    </div>
                    {#if showSuccess}
                        <div class="success-message">NWC string saved successfully!</div>
                    {/if}
                </form>
            </div>
        {/if}
    </div>
</div>

{#if errorMessage}
    <AlertModal 
        message={errorMessage} 
        onClose={() => errorMessage = null} 
    />
{/if}

<style>
    .settings-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
    }

    .section {
        background: white;
        border-radius: 8px;
        padding: 1.5rem;
        margin-top: 1rem;
        margin-bottom: 1rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    h1 {
        margin-bottom: 0.5rem;
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    h2 {
        margin-top: 0;
        margin-bottom: 1rem;
        color: #333;
    }

    .profile-info {
        display: flex;
        gap: 2rem;
        align-items: flex-start;
    }

    .profile-image {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        object-fit: cover;
    }

    .profile-details {
        flex: 1;
    }

    .field {
        margin-bottom: 1rem;
    }

    .field label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: #666;
    }

    .value {
        padding: 0.5rem;
        background: #f5f5f5;
        border-radius: 4px;
    }

    .monospace {
        font-family: monospace;
        word-break: break-all;
    }

    .help-text {
        margin-bottom: 1rem;
        color: #666;
    }

    .nwc-form {
        max-width: 600px;
    }

    .input-group {
        display: flex;
        gap: 1rem;
    }

    input {
        flex: 1;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }

    button {
        padding: 0.75rem 1.5rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button:hover {
        background: #0047b3;
    }

    .success-message {
        color: #2e7d32;
        background: #edf7ed;
        padding: 0.75rem;
        border-radius: 4px;
        margin-top: 1rem;
    }

    .zap-methods {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .method-option {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        padding: 1rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .method-option:hover {
        background: #f5f5f5;
    }

    .method-content {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .method-title {
        font-weight: 500;
    }

    .method-description {
        font-size: 0.9rem;
        color: #666;
    }

    .nwc-section {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid #ddd;
    }

    h3 {
        margin: 0 0 1rem 0;
        color: #333;
    }

    input[type="radio"]:disabled + .method-content {
        opacity: 0.5;
        cursor: not-allowed;
    }

    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
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
        color: #42526e;
    }

    .back-button:hover {
        background: #e4e6e8;
    }

    @media (prefers-color-scheme: dark) {
        .section {
            color: #333;
        }

        .method-option {
            border-color: #444;
        }

        .method-option:hover {
            background: #2d2d2d;
        }

        .method-description {
            color: #999;
        }

        .nwc-section {
            border-top-color: #444;
        }

        .back-button {
            background: #1e1855;
            color: #fff;
        }

        .back-button:hover {
            background: #2e2955;
        }
    }
</style> 