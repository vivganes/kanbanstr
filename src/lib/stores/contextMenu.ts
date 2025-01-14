import { writable } from 'svelte/store';

export const activeContextMenuId = writable<string | null>(null); 