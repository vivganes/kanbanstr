<script lang="ts">
    import { onMount } from 'svelte';
    import { ndkInstance, type LoginMethod } from '../ndk';
    
    let selectedMethod: LoginMethod = 'readonly';
    let nsecInput = '';
    let npubInput = '';
    let bunkerUriInput = '';
    let error = '';
    let loading = false;

    onMount(() => {
        const unsubscribe = ndkInstance.store.subscribe(state => {
            loading = state.isLoggingInNow;
        });

        return {
            unsubscribe
        };
    });


    async function handleLogin() {
        error = '';
        
        try {
            switch (selectedMethod) {
                case 'nsec':
                    if (!nsecInput.trim()) {
                        throw new Error('Please enter your nsec');
                    }
                    await ndkInstance.loginWithNsec(nsecInput);
                    break;
                    
                case 'npub':
                    if (!npubInput.trim()) {
                        throw new Error('Please enter your npub');
                    }
                    await ndkInstance.loginWithNpub(npubInput);
                    break;
                    
                case 'nip07':
                    await ndkInstance.loginWithNip07();
                    break;
                
                case 'bunker':
                    await ndkInstance.loginWithBunker(bunkerUriInput);
                    break;              
                                
                case 'readonly':
                    await ndkInstance.loginReadOnly();
                    break;
            }
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to login';
        } 
    }
</script>

<div class="login-container">
    <a href="/" class="logo-link">
        <h1>Kanbanstr</h1>
    </a>
    
    {#if !loading}
    <h2>Login</h2>
    
    <div class="method-selector">
        <label>
            <input 
                type="radio" 
                bind:group={selectedMethod} 
                value="readonly"
            >
            Read-only Mode (No account needed)
        </label>
        
        <label>
            <input 
                type="radio" 
                bind:group={selectedMethod} 
                value="nsec"
            >
            Login with nsec
        </label>
        
        <label>
            <input 
                type="radio" 
                bind:group={selectedMethod} 
                value="npub"
            >
            Login with npub (Read-only)
        </label>
        
        <label>
            <input 
                type="radio" 
                bind:group={selectedMethod} 
                value="nip07"
            >
            Login with <a href="https://nostr.com/get-started#keeping-keys-safe" target="_blank">browser extension</a>
        </label>
        
        <label>
            <input 
                type="radio" 
                bind:group={selectedMethod} 
                value="bunker"
            >
            Login with remote signer (Bunker)
        </label>
    </div>

    <div>
        <p>
            Don't have a <a href="https://nostr.com" target="_blank">nostr</a> account? <a href="https://primal.net/new" target="_blank">Click here</a> to get one.
        </p>
    </div>

    {#if selectedMethod === 'nsec'}
        <div class="input-group">
            <input
                type="password"
                bind:value={nsecInput}
                placeholder="Enter your nsec..."
            >
        </div>
    {/if}

    {#if selectedMethod === 'npub'}
        <div class="input-group">
            <input
                type="text"
                bind:value={npubInput}
                placeholder="Enter your npub..."
            >
        </div>
    {/if}

    {#if selectedMethod === 'bunker'}
        <div class="input-group">
            <input
                type="text"
                bind:value={bunkerUriInput}
                placeholder="bunker:// ..."
            >
        </div>
    {/if}
    {/if}

    {#if error}
        <div class="error">
            {error}
        </div>
    {/if}

    <button 
        on:click={handleLogin} 
        disabled={loading}
    >
        {loading ? 'Logging in...' : 'Login'}
    </button>
</div>

<style>
    .login-container {
        max-width: 400px;
        margin: 2rem auto;
        padding: 2rem;
        padding-top: 0.5rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    h2 {
        text-align: center;
        margin-bottom: 2rem;
    }

    .method-selector {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 2rem;
    }

    label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }

    .input-group {
        margin-bottom: 1rem;
    }

    input[type="text"],
    input[type="password"] {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
    }

    .error {
        color: #ff4444;
        margin-bottom: 1rem;
        text-align: center;
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
        opacity: 0.7;
        cursor: not-allowed;
    }

    button:hover:not(:disabled) {
        background: #0047b3;
    }

    h1{
        text-align: center;
        margin-bottom: 2rem;
        background: linear-gradient(90deg, #cc00b1, #5638ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    @media (prefers-color-scheme: dark) {
        .login-container {
                color: #333;
        }
    }
</style> 