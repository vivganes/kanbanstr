<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly } from 'svelte/transition';

    export let message: string;
    export let type: 'success' | 'error' = 'success';
    export let duration: number = 3000;
    export let onClose: () => void;

    onMount(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    });
</script>

<div
    class="toast {type}"
    transition:fly={{ y: 50, duration: 300 }}
    on:click={onClose}
>
    <span class="material-icons icon">
        {type === 'success' ? 'check_circle' : 'error'}
    </span>
    <span class="message">{message}</span>
</div>

<style>
    .toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 24px;
        border-radius: 6px;
        color: white;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        z-index: 9999;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        font-size: 0.9rem;
        min-width: 200px;
    }

    .success {
        background-color: #2ecc71;
    }

    .error {
        background-color: #e74c3c;
    }

    .icon {
        font-size: 1.2rem;
    }

    .message {
        margin-left: 4px;
    }

    @media (prefers-color-scheme: dark) {
        .success {
            background-color: #27ae60;
        }

        .error {
            background-color: #c0392b;
        }
    }
</style> 