<script lang="ts">
    export let message: string;
    export let onConfirm: () => void;
    export let onCancel: () => void;
</script>

<div class="modal-backdrop" on:click={onCancel}>
    <div class="modal" on:click|stopPropagation>
        <div class="modal-content">
            <p>{message}</p>
            <div class="modal-actions">
                <button class="cancel-button" on:click={onCancel}>Cancel</button>
                <button class="confirm-button" on:click={onConfirm}>Confirm</button>
            </div>
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
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: white;
        border-radius: 8px;
        padding: 1.5rem;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .modal-content {
        text-align: center;
    }

    .modal-content p {
        margin: 0 0 1.5rem 0;
        color: #333;
        font-size: 1.1rem;
    }

    .modal-actions {
        display: flex;
        justify-content: center;
        gap: 1rem;
    }

    button {
        padding: 0.5rem 2rem;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1rem;
        transition: background-color 0.2s;
    }

    .cancel-button {
        background: #f4f5f7;
        color: #42526e;
        border: 1px solid #dfe1e6;
    }

    .cancel-button:hover {
        background: #ebecf0;
    }

    .confirm-button {
        background: #de350b;
        color: white;
    }

    .confirm-button:hover {
        background: #bf2600;
    }
</style> 