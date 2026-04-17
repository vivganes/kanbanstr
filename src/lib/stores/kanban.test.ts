/**
 * Regression / characterization tests for createKanbanStore.
 *
 * These tests document and protect **existing** behaviour so that adding
 * loadCommentsForCard / publishComment (the next step) cannot silently
 * break the store internals.
 *
 * Seams used:
 *  - Seam 1: store.init(mockNdk)  — injects a fake NDK via closure
 *  - Seam 2: vi.mock('../ndk')    — stubs ndkInstance.publishEvent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type NDK from '@nostr-dev-kit/ndk';

// ── Seam 2: stub ndkInstance before importing the store ──────────────────────
// vi.mock factories are hoisted, so we use vi.hoisted() for any variables
// they reference.
const { mockNdkStore, mockPublishEvent } = vi.hoisted(() => {
    const { writable } = require('svelte/store');
    return {
        mockNdkStore: writable({ user: null }),
        mockPublishEvent: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock('../ndk', () => ({
    ndkInstance: {
        publishEvent: mockPublishEvent,
        store: mockNdkStore,
    },
    bunkerPublishing: (() => { const { writable } = require('svelte/store'); return writable(false); })(),
}));

// Also stub donationStore so createCard / createBoard don't explode
vi.mock('./donation', () => ({
    donationStore: { showDonationRequest: vi.fn() },
}));

import { createKanbanStore } from './kanban';

// ── Minimal mock NDK (Seam 1) ────────────────────────────────────────────────
function makeMockNdk(): NDK {
    return {
        fetchEvents: vi.fn().mockResolvedValue(new Set()),
        fetchEvent: vi.fn().mockResolvedValue(null),
    } as unknown as NDK;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeStore() {
    const store = createKanbanStore();
    const mockNdk = makeMockNdk();
    store.init(mockNdk);
    return { store, mockNdk };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('createKanbanStore – factory & init', () => {
    it('returns a store with the expected public API', () => {
        const store = createKanbanStore();
        expect(typeof store.subscribe).toBe('function');
        expect(typeof store.init).toBe('function');
        expect(typeof store.clearStore).toBe('function');
        expect(typeof store.hasNDK).toBe('function');
        expect(typeof store.loadBoards).toBe('function');
        expect(typeof store.loadCardsForBoard).toBe('function');
        expect(typeof store.createBoard).toBe('function');
        expect(typeof store.createCard).toBe('function');
        expect(typeof store.updateCard).toBe('function');
        expect(typeof store.updateBoard).toBe('function');
    });

    it('starts with an empty, non-loading state', () => {
        const store = createKanbanStore();
        const state = get(store);
        expect(state.boards).toEqual([]);
        expect(state.myBoards).toEqual([]);
        expect(state.maintainingBoards).toEqual([]);
        expect(state.cards).toBeInstanceOf(Map);
        expect(state.cards.size).toBe(0);
        expect(state.loading).toBe(false);
        expect(state.currentUser).toBeNull();
        expect(state.error).toBeNull();
    });

    it('throws when init is called with a falsy value', () => {
        const store = createKanbanStore();
        expect(() => store.init(null as unknown as NDK)).toThrow('NDK instance is required');
    });

    it('hasNDK returns false before init', () => {
        const store = createKanbanStore();
        expect(store.hasNDK()).toBe(false);
    });

    it('hasNDK returns true after init', () => {
        const { store } = makeStore();
        expect(store.hasNDK()).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('createKanbanStore – clearStore', () => {
    it('resets state back to the initial empty shape', async () => {
        const { store, mockNdk } = makeStore();

        // Simulate loadBoards putting something in state
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Set());
        await store.loadBoards();

        await store.clearStore();
        const state = get(store);

        expect(state.boards).toEqual([]);
        expect(state.myBoards).toEqual([]);
        expect(state.cards.size).toBe(0);
        expect(state.loading).toBe(false);
        expect(state.currentUser).toBeNull();
        expect(state.error).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('createKanbanStore – loadBoards', () => {
    it('sets loading=false and populates boards after a successful fetch', async () => {
        const { store, mockNdk } = makeStore();

        const fakeEvent = {
            id: 'event1',
            pubkey: 'pubkey1',
            tags: [
                ['d', 'board-1'],
                ['title', 'My Board'],
                ['description', 'A test board'],
                ['col', 'col-1', 'Todo', '0'],
                ['col', 'col-2', 'Done', '1'],
            ],
            content: '',
        };
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Set([fakeEvent]));

        await store.loadBoards();

        const state = get(store);
        expect(state.loading).toBe(false);
        expect(state.boards).toHaveLength(1);
        expect(state.boards[0].id).toBe('board-1');
        expect(state.boards[0].title).toBe('My Board');
        expect(state.boards[0].columns).toHaveLength(2);
    });

    it('sets loading=false and boards=[] when no events are returned', async () => {
        const { store, mockNdk } = makeStore();
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Set());

        await store.loadBoards();

        const state = get(store);
        expect(state.loading).toBe(false);
        expect(state.boards).toEqual([]);
    });

    it('marks needsMigration=true for legacy boards with a tags', async () => {
        const { store, mockNdk } = makeStore();

        const legacyEvent = {
            id: 'legacy1',
            pubkey: 'pubkey1',
            tags: [
                ['d', 'legacy-board'],
                ['title', 'Legacy'],
                ['a', '30302:pubkey1:card-1'],
            ],
            content: JSON.stringify({ columns: [], description: 'legacy' }),
        };
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Set([legacyEvent]));

        await store.loadBoards();

        const state = get(store);
        expect(state.boards[0].needsMigration).toBe(true);
    });

    it('sets isNoZapBoard=true when event has a nozap tag', async () => {
        const { store, mockNdk } = makeStore();

        const nozapEvent = {
            id: 'e1',
            pubkey: 'p1',
            tags: [
                ['d', 'nozap-board'],
                ['title', 'No Zap'],
                ['nozap'],
            ],
            content: '',
        };
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Set([nozapEvent]));

        await store.loadBoards();

        const state = get(store);
        expect(state.boards[0].isNoZapBoard).toBe(true);
    });

    it('sets error state and re-throws when fetchEvents rejects', async () => {
        const { store, mockNdk } = makeStore();
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('relay error'));

        await expect(store.loadBoards()).rejects.toThrow('relay error');

        const state = get(store);
        expect(state.loading).toBe(false);
        expect(state.error).toBe('relay error');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('createKanbanStore – ndkInstance.publishEvent seam', () => {
    it('is called once when createBoard is invoked', async () => {
        const { store, mockNdk } = makeStore();
        // loadBoards / loadMyBoards called internally after createBoard
        (mockNdk.fetchEvents as ReturnType<typeof vi.fn>).mockResolvedValue(new Set());

        mockPublishEvent.mockClear();

        await store.createBoard('Test Board', 'desc', [
            { id: 'col-1', name: 'Todo', order: 0 },
        ]);

        expect(mockPublishEvent).toHaveBeenCalledOnce();
    });
});
