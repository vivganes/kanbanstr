/**
 * Pinning / characterization tests for CardDetails.svelte BEFORE the additive
 * <CardComments> change is applied.
 *
 * These tests document and lock down existing rendered behavior so that the
 * single-line template addition (one import + one component tag) cannot
 * accidentally break anything that works today.
 *
 * Mocking strategy (from plan/seams-and-dependencies.md):
 *  - `vi.mock` replaces the entire module before any import resolves.
 *  - ndkInstance  → hand-written stub (avoids localStorage / relay side-effects).
 *  - kanbanStore  → stub that resolves async calls immediately with empty data.
 *  - User utilities → stubs that return predictable display names.
 *  - TipTap Editor → real constructor runs fine in jsdom; no mock needed.
 *  - getContext('board') → supplied via the context map in render options.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/svelte';

// ---------------------------------------------------------------------------
// 1. Module-level mocks — MUST be declared before the component import so
//    Vitest's hoisting places them above all resolved imports.
// ---------------------------------------------------------------------------

vi.mock('../ndk', () => ({
    ndkInstance: {
        ndk: { fetchEvents: vi.fn().mockResolvedValue(new Set()) },
        publishEvent: vi.fn().mockResolvedValue(undefined),
        store: {
            subscribe: vi.fn((cb: (state: unknown) => void) => {
                cb({ user: null, loginMethod: null, isReady: false });
                return () => {};
            }),
        },
        canWrite: vi.fn(() => false),
    },
}));

vi.mock('../stores/kanban', () => {
    const subscribeFn = vi.fn((cb: (state: unknown) => void) => {
        cb({
            boards: [],
            myBoards: [],
            maintainingBoards: [],
            cards: new Map(),
            loading: false,
            error: null,
        });
        return () => {};
    });

    return {
        kanbanStore: {
            subscribe: subscribeFn,
            loadMyBoards: vi.fn().mockResolvedValue(undefined),
            loadMaintainingBoards: vi.fn().mockResolvedValue(undefined),
            updateCard: vi.fn().mockResolvedValue(undefined),
            cloneCardToBoard: vi.fn().mockResolvedValue(undefined),
            getSingleCard: vi.fn().mockResolvedValue(null),
            getOutgoingLinkedCards: vi.fn().mockResolvedValue([]),
            getIncomingLinkedCards: vi.fn().mockResolvedValue([]),
            updateStateWithIncomingLinkToACard: vi.fn().mockResolvedValue(undefined),
            updateStateWithDeletedOutgoingLinkFromACard: vi.fn().mockResolvedValue(undefined),
        },
        BoardListType: {
            MyBoards: 'My Boards',
            MaintainingBoards: 'Boards I maintain',
            All: 'All Boards',
        },
    };
});

vi.mock('../utils/user', () => ({
    getUserDisplayName: vi.fn().mockResolvedValue('Test User'),
    getUserDisplayNameByNip05: vi.fn().mockResolvedValue('Test User NIP05'),
    resolveIdentifier: vi.fn().mockResolvedValue(
        'aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011aabbccddeeff0011',
    ),
}));

vi.mock('../stores/toast', () => ({
    toastStore: {
        addToast: vi.fn(),
    },
}));

// ---------------------------------------------------------------------------
// 2. Import component AFTER mocks are declared
// ---------------------------------------------------------------------------

import CardDetails from './CardDetails.svelte';

// ---------------------------------------------------------------------------
// 3. Shared test data
// ---------------------------------------------------------------------------

/** Minimal Card fixture that satisfies the Card interface */
const baseCard = {
    id:            'event-id-abc',
    naddr:         'naddr1test',
    dTag:          'my-card-dtag',
    pubkey:        'pubkey-card-owner',
    title:         'Test Card Title',
    description:   'Test description',
    status:        'To Do',
    order:         1,
    attachments:   [],
    assignees:     [],
    tTags:         [],
    iTags:         [],
    outgoingLinks: [],
    incomingLinks: [],
    created_at:    1700000000,
};

/** Minimal KanbanBoard fixture for getContext('board') */
const baseBoard = {
    id:           'board-dtag',
    pubkey:       'board-owner-pubkey',
    title:        'Test Board',
    description:  'Test board description',
    columns:      [],
    isNoZapBoard: false,
    maintainers:  [],
};

const baseProps = {
    card:        baseCard,
    boardPubkey: 'board-owner-pubkey',
    boardId:     'board-dtag',
    onClose:     vi.fn(),
    isUnmapped:  false,
    readOnly:    false,
};

// ---------------------------------------------------------------------------
// Helper: render CardDetails and inject the board context.
//
// @testing-library/svelte v5 supports a `context` option in the render call,
// which forwards a Map as the Svelte component context.
// ---------------------------------------------------------------------------

function renderCardDetails(props = baseProps) {
    return render(CardDetails, {
        props,
        context: new Map([['board', baseBoard]]),
    });
}

// ---------------------------------------------------------------------------
// 4. Tests
// ---------------------------------------------------------------------------

describe('CardDetails.svelte — pinning tests (pre-CardComments change)', () => {

    // Clean up DOM between tests so elements from previous renders don't bleed
    // into subsequent queries.
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    // -- Presence / structure ------------------------------------------------

    it('renders the card title in the title input', () => {
        renderCardDetails();

        const titleInput = screen.getByPlaceholderText('Card Title') as HTMLInputElement;
        expect(titleInput).toBeDefined();
        expect(titleInput.value).toBe('Test Card Title');
    });

    it('renders the Cancel button', () => {
        renderCardDetails();
        // There is exactly one Cancel button per rendered instance.
        const cancel = screen.getByText('Cancel');
        expect(cancel).toBeDefined();
    });

    it('renders the Save Changes button when readOnly is false', () => {
        renderCardDetails({ ...baseProps, readOnly: false });
        const save = screen.getByText('Save Changes');
        expect(save).toBeDefined();
    });

    it('does NOT render the Save Changes button when readOnly is true', () => {
        renderCardDetails({ ...baseProps, readOnly: true });
        const save = screen.queryByText('Save Changes');
        expect(save).toBeNull();
    });

    // -- readOnly gate on compose UI elements --------------------------------

    it('does NOT render the Add Attachment button when readOnly is true', () => {
        renderCardDetails({ ...baseProps, readOnly: true });
        const addBtn = screen.queryByText('Add Attachment');
        expect(addBtn).toBeNull();
    });

    it('renders the Add Attachment button when readOnly is false', () => {
        renderCardDetails({ ...baseProps, readOnly: false });
        const addBtn = screen.getByText('Add Attachment');
        expect(addBtn).toBeDefined();
    });

    it('does NOT render the Add Tag button when readOnly is true', () => {
        renderCardDetails({ ...baseProps, readOnly: true });
        const addTagBtn = screen.queryByText('Add Tag');
        expect(addTagBtn).toBeNull();
    });

    it('renders the Add Tag button when readOnly is false', () => {
        renderCardDetails({ ...baseProps, readOnly: false });
        const addTagBtn = screen.getByText('Add Tag');
        expect(addTagBtn).toBeDefined();
    });

    // -- Attachments section -------------------------------------------------

    it('shows "No attachments" when the card has no attachments', () => {
        renderCardDetails({ ...baseProps, card: { ...baseCard, attachments: [] } });
        expect(screen.getByText('No attachments')).toBeDefined();
    });

    it('renders a listed attachment URL when the card has attachments', () => {
        const card = { ...baseCard, attachments: ['https://example.com/file.pdf'] };
        renderCardDetails({ ...baseProps, card });
        expect(screen.getByText('https://example.com/file.pdf')).toBeDefined();
    });

    // -- Assignees section ---------------------------------------------------

    it('shows "No assignees" when the card has no assignees', () => {
        renderCardDetails({ ...baseProps, card: { ...baseCard, assignees: [] } });
        expect(screen.getByText('No assignees')).toBeDefined();
    });

    // -- Tags section --------------------------------------------------------

    it('shows "No Tags" when the card has no tTags', () => {
        renderCardDetails({ ...baseProps, card: { ...baseCard, tTags: [] } });
        expect(screen.getByText('No Tags')).toBeDefined();
    });

    it('renders tag text when the card has tTags', () => {
        const card = { ...baseCard, tTags: ['bug', 'urgent'] };
        renderCardDetails({ ...baseProps, card });
        expect(screen.getByText('bug')).toBeDefined();
        expect(screen.getByText('urgent')).toBeDefined();
    });

    // -- Card Links section --------------------------------------------------

    it('renders the Card Links heading', () => {
        renderCardDetails();
        expect(screen.getByText('Card Links')).toBeDefined();
    });

    it('shows "Loading links..." while the async link fetch is in-flight', () => {
        // On first render, onMount starts fillLinksForCard() which sets
        // loadingLinks = true synchronously before any await resolves.
        renderCardDetails();
        expect(screen.getByText('Loading links...')).toBeDefined();
    });

    it('shows "Loading links..." for card links section on initial render (async fill in progress)', async () => {
        // fillLinksForCard() is called in onMount and sets loadingLinks = true.
        // The {#if loadingLinks} block renders "Loading links..." while the async
        // getOutgoingLinkedCards / getIncomingLinkedCards calls are in-flight.
        // This pinning test documents that the loading state is the *initial*
        // synchronously observable state in the jsdom test environment.
        renderCardDetails({ ...baseProps, card: { ...baseCard, outgoingLinks: [] } });
        // The loading state is visible immediately after render
        expect(screen.getByText('Loading links...')).toBeDefined();
        // The links section inner content is not yet visible while loading
        expect(screen.queryByText('No outgoing links')).toBeNull();
    });

    it('shows "Loading links..." for card links section and not "No incoming links" on initial render', async () => {
        renderCardDetails({ ...baseProps, card: { ...baseCard, incomingLinks: [] } });
        expect(screen.getByText('Loading links...')).toBeDefined();
        expect(screen.queryByText('No incoming links')).toBeNull();
    });

    // -- Status section ------------------------------------------------------

    it('renders the current card status in the status display (non-unmapped mode)', () => {
        renderCardDetails({ ...baseProps, isUnmapped: false });
        expect(screen.getByText('To Do')).toBeDefined();
    });

    // -- onClose is wired to Cancel ------------------------------------------

    it('calls onClose when the Cancel button is clicked', async () => {
        const onClose = vi.fn();
        renderCardDetails({ ...baseProps, onClose });

        await fireEvent.click(screen.getByText('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // -- Clone to Board section ----------------------------------------------

    it('renders the Clone to Board label', () => {
        renderCardDetails();
        expect(screen.getByText('Clone to Board')).toBeDefined();
    });
});
