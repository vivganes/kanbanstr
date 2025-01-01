<script lang="ts">
    export let message: string;
    export let onClose: () => void;
</script>

<div class="modal-backdrop" on:click={onClose}>
    <div class="modal-content" on:click|stopPropagation>
        <div class="error-icon">⚠️</div>
        <p>{message}</p>
        <button on:click={onClose}>Close</button>
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
        z-index: 1100;
    }

    .modal-content {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .error-icon {
        font-size: 2rem;
        margin-bottom: 1rem;
    }

    p {
        color: #dc3545;
        margin: 0 0 1.5rem 0;
    }

    button {
        padding: 0.5rem 1.5rem;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }

    button:hover {
        background: #c82333;
    }
</style> 