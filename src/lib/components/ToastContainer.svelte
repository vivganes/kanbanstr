<script lang="ts">
    import { toastStore } from '../stores/toast';
    import Toast from './Toast.svelte';
</script>

<div class="toast-container">
    {#each $toastStore as toast (toast.id)}
        <Toast
            message={toast.message}
            type={toast.type}   
            onClose={() => toastStore.removeToast(toast.id)}
        />
    {/each}
</div>

<style>
    .toast-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 9999;
    }
</style> 