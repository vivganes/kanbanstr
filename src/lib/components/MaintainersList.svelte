<script lang="ts">
    import { getUserDisplayName, getUserDisplayNameByNip05, resolveIdentifier } from '../utils/user';

    export let maintainers: string[] = [];
    export let onChange: (maintainers: string[]) => void;
    export let disabled: boolean = false;

    let newMaintainer = '';
    let currentMaintainerDisplay: string | null = null;
    let isLoadingMaintainer = false;
    let maintainerError: string | null = null;

    async function validateMaintainer(value: string) {
        if (!value.trim()) {
            currentMaintainerDisplay = null;
            isLoadingMaintainer = false;
            maintainerError = null;
            return;
        }

        isLoadingMaintainer = true;
        maintainerError = null;
        try {
            if (value.includes('@')) {
                currentMaintainerDisplay = await getUserDisplayNameByNip05(value.trim());
            } else {
                currentMaintainerDisplay = await getUserDisplayName(value.trim());
            }
        } catch (error) {
            currentMaintainerDisplay = null;
            maintainerError = "Invalid identifier";
        } finally {
            isLoadingMaintainer = false;
        }
    }

    async function addMaintainer() {
        if (newMaintainer.trim() && !maintainers.includes(newMaintainer.trim())) {
            try {
                const hexPubkey = await resolveIdentifier(newMaintainer.trim());
                const updatedMaintainers = [...maintainers, hexPubkey];
                onChange(updatedMaintainers);
                newMaintainer = '';
                currentMaintainerDisplay = null;
            } catch (error) {
                console.error('Error in addMaintainer:', error);
                maintainerError = "Invalid identifier or unable to fetch user profile";
            }
        }
    }

    function removeMaintainer(index: number) {
        const updatedMaintainers = maintainers.filter((_, i) => i !== index);
        onChange(updatedMaintainers);
    }
</script>

<span class="maintainers-list">
    {#each maintainers as maintainer, i}
        <span class="maintainer-item">
            {#await getUserDisplayName(maintainer)}
                <span>Loading...</span>
            {:then name}
                <span>{name}</span>
            {:catch}
                <span>Anonymous</span>
            {/await}
            {#if !disabled}
                <button type="button" class="remove-btn" on:click={() => removeMaintainer(i)}>
                    &times;
                </button>
            {/if}
        </span>
    {/each}
</span>

{#if !disabled}
    <div class="add-maintainer">
        <div class="maintainer-input-wrapper">
            <input
                bind:value={newMaintainer}
                placeholder="Enter npub, NIP-05 (name@domain) / identifier, or hex pubkey"
                on:input={() => validateMaintainer(newMaintainer)}
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addMaintainer())}
            />
            {#if isLoadingMaintainer}
                <div class="validation-feedback">Loading...</div>
            {:else if currentMaintainerDisplay}
                <div class="validation-feedback valid">✓ {currentMaintainerDisplay}</div>
            {:else if maintainerError}
                <div class="validation-feedback error">{maintainerError}</div>
            {/if}
        </div>
        <button 
            type="button"
            on:click={addMaintainer}
            disabled={!currentMaintainerDisplay || isLoadingMaintainer}
        >
            Add Maintainer
        </button>
    </div>
{/if}

<style>
    .maintainers-list {
        margin-bottom: 0.5rem;
    }

    .maintainer-item {
        align-items: center;
        background: #f5f5f5;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        margin-left:0.5rem;
    }

    .remove-btn {
        background: none;
        border: none;
        color: #ff4444;
        cursor: pointer;
        padding: 0 0.5rem;
    }

    .maintainer-input-wrapper {
        position: relative;
        flex: 1;
        margin-bottom: 1rem;
    }

    .add-maintainer {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        align-items: flex-start;
    }

    .add-maintainer input {
        height: 36px;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        width: 100%;
        box-sizing: border-box;
    }

    .add-maintainer button {
        height: 36px;
        white-space: nowrap;
        padding: 0.5rem 1rem;
        background: #0052cc;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    .add-maintainer button:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .validation-feedback {
        position: absolute;
        top: 100%;
        left: 0;
        font-size: 0.8rem;
        margin-top: 4px;
        white-space: nowrap;
    }

    .validation-feedback.valid {
        color: #28a745;
    }

    .validation-feedback.error {
        color: #dc3545;
    }

    @media (prefers-color-scheme: dark) {
        .maintainer-item {
            background: #2d2d2d;
            color: #fff;
        }

        .add-maintainer input {
            background: #1d1d1d;
            border-color: #444;
            color: #fff;
        }
    }
</style> 