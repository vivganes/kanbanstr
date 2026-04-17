import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { createToastStore } from './toast';

describe('toastStore', () => {
    it('adds a toast with the given message and type', () => {
        const store = createToastStore(1000);

        expect(get(store)).toEqual([]);

        store.addToast('Test message', 'success');

        const current = get(store);
        expect(current).toHaveLength(1);
        expect(current[0]).toMatchObject({ message: 'Test message', type: 'success' });
        expect(typeof current[0].id).toBe('string');
    });

    it('removes a toast after the timeout elapses', async () => {
        const store = createToastStore(10);

        store.addToast('Expire message', 'error');
        expect(get(store)).toHaveLength(1);

        await new Promise(resolve => setTimeout(resolve, 20));

        expect(get(store)).toEqual([]);
    });

    it('removes a toast immediately when removeToast is called', () => {
        const store = createToastStore(1000);

        store.addToast('Manual remove', 'success');
        const [toast] = get(store);

        expect(toast).toBeDefined();
        store.removeToast(toast.id);

        expect(get(store)).toEqual([]);
    });
});