<script lang="ts">
    export let onClose: () => void;
    export let onZap: (amount: number, comment: string) => Promise<void>;

    let amount = 21; // Default amount
    let comment = '';
    let isZapping = false;
    let error: string | null = null;

    const predefinedAmounts = [21, 210, 420, 100, 500, 1000, 2100];

    async function handleZap() {
        if (isZapping) return;
        if (amount <= 0) {
            error = 'Amount must be greater than 0';
            return;
        }

        try {
            isZapping = true;
            error = null;
            await onZap(amount, comment);
            onClose();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Failed to zap';
        } finally {
            isZapping = false;
        }
    }
</script>

<div class="modal-backdrop" on:click={onClose}>
    <div class="modal" on:click|stopPropagation>
        <h2>Send Sats ⚡</h2>

        <div class="amount-section">
            <label for="amount">Amount (sats)</label>
            <input
                type="number"
                id="amount"
                bind:value={amount}
                min="1"
                placeholder="Enter amount in sats"
            />
            
            <div class="preset-amounts">
                {#each predefinedAmounts as presetAmount}
                    <button 
                        class="preset-btn"
                        class:selected={amount === presetAmount}
                        on:click={() => amount = presetAmount}
                    >
                        {presetAmount.toLocaleString()}
                    </button>
                {/each}
            </div>
        </div>

        <div class="comment-section">
            <label for="comment">Comment (optional)</label>
            <textarea
                id="comment"
                bind:value={comment}
                maxlength="255"
                rows="3"
                placeholder="Add a comment..."
            ></textarea>
            <div class="char-count">
                {comment.length}/255
            </div>
        </div>

        {#if error}
            <div class="error">
                {error}
            </div>
        {/if}

        <div class="actions">
            <button class="cancel" on:click={onClose}>Cancel</button>
            <button 
                class="zap" 
                on:click={handleZap}
                disabled={isZapping || amount <= 0}
            >
                {isZapping ? 'Zapping...' : 'Zap ⚡'}
            </button>
        </div>
    </div>
</div>

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

    h2 {
        margin: 0 0 1.5rem 0;
        text-align: center;
    }

    .amount-section, .comment-section {
        margin-bottom: 1.5rem;
    }

    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
    }

    input, textarea {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 1rem;
    }

    .preset-amounts {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .preset-btn {
        background: #f0f0f0;
        border: 1px solid #ddd;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .preset-btn.selected {
        background: #ffd700;
        border-color: #ffd700;
        color: black;
    }

    .char-count {
        text-align: right;
        font-size: 0.8rem;
        color: #666;
        margin-top: 0.25rem;
    }

    .actions {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
    }

    button {
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
    }

    .cancel {
        background: none;
        border: 1px solid #ddd;
    }

    .zap {
        background: #ffd700;
        border: none;
        color: black;
    }

    .zap:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .error {
        color: #ff4444;
        background: #ffebee;
        padding: 0.75rem;
        border-radius: 4px;
        margin-bottom: 1rem;
    }

    @media (prefers-color-scheme: dark) {
        .modal {
            background: #2d2d2d;
            color: #fff;
        }

        input, textarea {
            background: #1d1d1d;
            border-color: #444;
            color: #fff;
        }

        .preset-btn {
            background: #1d1d1d;
            border-color: #444;
            color: #fff;
        }

        .preset-btn.selected {
            background: #ffd700;
            border-color: #ffd700;
            color: black;
        }

        .cancel {
            border-color: #444;
            color: #fff;
        }
    }
</style> 