import { writable } from 'svelte/store';

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error';
}

function createToastStore() {
    const { subscribe, update } = writable<Toast[]>([]);

    function addToast(message: string, type: 'success' | 'error' = 'success') {
        const id = Math.random().toString(36).substr(2, 9);
        update(toasts => [...toasts, { id, message, type }]);

        setTimeout(() => {
            removeToast(id);
        }, 3000);
    }

    function removeToast(id: string) {
        update(toasts => toasts.filter(t => t.id !== id));
    }

    return {
        subscribe,
        addToast,
        removeToast
    };
}

export const toastStore = createToastStore(); 