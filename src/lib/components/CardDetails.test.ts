/**
 * Component tests for the Comments section of CardDetails.svelte.
 *
 * Seams used:
 *  - vi.mock('../stores/kanban')  — controls loadCommentsForCard / publishComment
 *  - vi.mock('../ndk')            — controls currentUser via ndkInstance.store
 *  - vi.mock('@tiptap/core')      — prevents TipTap DOM errors in jsdom
 *
 * Tests are ordered RED → GREEN (written to fail against a component that has
 * NO comments section, then pass once the section is implemented).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/svelte';

// ── Hoisted shared mocks ─────────────────────────────────────────────────────
const {
    mockNdkStore,
    mockKanbanState,
    mockLoadCommentsForCard,
    mockPublishComment,
    mockLoadMyBoards,
    mockLoadMaintainingBoards,
    mockGetOutgoingLinkedCards,
    mockGetIncomingLinkedCards,
} = vi.hoisted(() => {
    const { writable } = require('svelte/store');
    return {
        mockNdkStore: writable({ user: null, loginMethod: null }),
        mockKanbanState: writable({ myBoards: [], maintainingBoards: [], cards: new Map() }),
        mockLoadCommentsForCard: vi.fn().mockResolvedValue([]),
        mockPublishComment: vi.fn().mockResolvedValue(undefined),
        mockLoadMyBoards: vi.fn().mockResolvedValue(undefined),
        mockLoadMaintainingBoards: vi.fn().mockResolvedValue(undefined),
        mockGetOutgoingLinkedCards: vi.fn().mockResolvedValue([]),
        mockGetIncomingLinkedCards: vi.fn().mockResolvedValue([]),
    };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

// TipTap: prevent real DOM / ProseMirror errors in jsdom
vi.mock('@tiptap/core', () => ({
    Editor: vi.fn().mockImplementation(() => ({
        destroy: vi.fn(),
        setEditable: vi.fn(),
        storage: { markdown: { getMarkdown: vi.fn().mockReturnValue('') } },
    })),
}));
vi.mock('@tiptap/starter-kit', () => ({ default: {} }));
vi.mock('@tiptap/extension-link', () => ({
    default: { configure: vi.fn().mockReturnValue({}) },
}));
vi.mock('tiptap-markdown', () => ({
    Markdown: { configure: vi.fn().mockReturnValue({}) },
}));

vi.mock('../ndk', () => ({
    ndkInstance: { store: mockNdkStore },
}));

vi.mock('../stores/kanban', () => ({
    kanbanStore: {
        subscribe: mockKanbanState.subscribe,
        loadMyBoards: mockLoadMyBoards,
        loadMaintainingBoards: mockLoadMaintainingBoards,
        loadCommentsForCard: mockLoadCommentsForCard,
        publishComment: mockPublishComment,
        getOutgoingLinkedCards: mockGetOutgoingLinkedCards,
        getIncomingLinkedCards: mockGetIncomingLinkedCards,
        updateCard: vi.fn().mockResolvedValue(undefined),
        getSingleCard: vi.fn().mockResolvedValue(null),
        cloneCardToBoard: vi.fn().mockResolvedValue(undefined),
        updateStateWithIncomingLinkToACard: vi.fn(),
        updateStateWithDeletedOutgoingLinkFromACard: vi.fn(),
    },
}));

vi.mock('../stores/toast', () => ({
    toastStore: { addToast: vi.fn() },
}));

vi.mock('../utils/user', () => ({
    getUserDisplayName: vi.fn().mockResolvedValue('Test User'),
    getUserDisplayNameByNip05: vi.fn().mockResolvedValue('Test User'),
    resolveIdentifier: vi.fn().mockResolvedValue('pubkey123'),
}));

// ── Import component after mocks ─────────────────────────────────────────────
import CardDetails from './CardDetails.svelte';

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeCard() {
    return {
        id: 'card-event-id',
        naddr: 'naddr123',
        dTag: 'card-dtag',
        pubkey: 'card-pubkey',
        title: 'Test Card',
        description: '',
        status: 'Todo',
        order: 10,
        created_at: 1700000000,
        attachments: [],
        assignees: [],
        tTags: [],
        iTags: [],
        outgoingLinks: [],
        incomingLinks: [],
        aTags: ['30301:boardpubkey:boardid'],
    };
}

function makeBoard() {
    return {
        id: 'boardid',
        pubkey: 'boardpubkey',
        title: 'Test Board',
        description: '',
        columns: [{ id: 'col-1', name: 'Todo', order: 0 }],
        isNoZapBoard: false,
        maintainers: [],
    };
}

function renderCardDetails(propOverrides = {}) {
    return render(CardDetails, {
        props: {
            card: makeCard(),
            boardPubkey: 'boardpubkey',
            boardId: 'boardid',
            onClose: vi.fn(),
            readOnly: false,
            ...propOverrides,
        },
        context: new Map([['board', makeBoard()]]),
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('CardDetails – Comments section', () => {
    afterEach(() => cleanup());

    beforeEach(() => {
        vi.clearAllMocks();
        mockLoadCommentsForCard.mockResolvedValue([]);
        mockPublishComment.mockResolvedValue(undefined);
        mockNdkStore.set({ user: null, loginMethod: null });
    });

    it('renders a Comments heading', async () => {
        const { container } = renderCardDetails();
        await waitFor(() => expect(within(container).getByText('Comments')).toBeDefined());
    });

    it('calls loadCommentsForCard on mount with the correct board pubkey and card dTag', async () => {
        renderCardDetails();
        await waitFor(() => expect(mockLoadCommentsForCard).toHaveBeenCalledWith('boardpubkey', 'card-dtag'));
    });

    it('shows "No comments yet." when loadCommentsForCard returns an empty array', async () => {
        mockLoadCommentsForCard.mockResolvedValue([]);
        const { container } = renderCardDetails();
        await waitFor(() => expect(within(container).getByText('No comments yet.')).toBeDefined());
    });

    it('renders comment content after loading', async () => {
        mockLoadCommentsForCard.mockResolvedValue([
            {
                id: 'cmt-1',
                pubkey: 'author-pubkey',
                content: 'This is a great card!',
                created_at: 1700000000,
                parentId: null,
                parentType: 'card',
            },
        ]);
        const { container } = renderCardDetails();
        await waitFor(() => expect(within(container).getByText('This is a great card!')).toBeDefined());
    });

    it('renders multiple comments', async () => {
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'c1', pubkey: 'p1', content: 'First comment', created_at: 1700000000, parentId: null, parentType: 'card' },
            { id: 'c2', pubkey: 'p2', content: 'Second comment', created_at: 1700000100, parentId: null, parentType: 'card' },
        ]);
        const { container } = renderCardDetails();
        await waitFor(() => {
            expect(within(container).getByText('First comment')).toBeDefined();
            expect(within(container).getByText('Second comment')).toBeDefined();
        });
    });

    it('renders a reply indented under its parent comment', async () => {
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'c1', pubkey: 'p1', content: 'Top level', created_at: 1700000000, parentId: null, parentType: 'card' },
            { id: 'r1', pubkey: 'p2', content: 'A reply here', created_at: 1700000100, parentId: 'c1', parentType: 'reply' },
        ]);
        const { container } = renderCardDetails();
        await waitFor(() => {
            expect(within(container).getByText('A reply here')).toBeDefined();
            const replyEl = within(container).getByText('A reply here').closest('.comment-reply');
            expect(replyEl).not.toBeNull();
        });
    });

    it('hides the comment input when readOnly=true', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        const { container } = renderCardDetails({ readOnly: true });
        await waitFor(() => within(container).getByText('No comments yet.'));
        expect(within(container).queryByPlaceholderText('Add a comment...')).toBeNull();
    });

    it('hides the comment input when no user is logged in', async () => {
        mockNdkStore.set({ user: null, loginMethod: null });
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByText('No comments yet.'));
        expect(within(container).queryByPlaceholderText('Add a comment...')).toBeNull();
    });

    it('shows the comment input when a user is logged in and not readOnly', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByPlaceholderText('Add a comment...'));
    });

    it('Post Comment button is disabled when the textarea is empty', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByText('Post Comment'));
        const btn = within(container).getByText('Post Comment') as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
    });

    it('Post Comment button becomes enabled when text is entered', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByPlaceholderText('Add a comment...'));
        const textarea = within(container).getByPlaceholderText('Add a comment...') as HTMLTextAreaElement;
        await fireEvent.input(textarea, { target: { value: 'hello' } });
        await waitFor(() => {
            const btn = within(container).getByText('Post Comment') as HTMLButtonElement;
            expect(btn.disabled).toBe(false);
        });
    });

    it('clicking Post Comment calls publishComment with the correct arguments', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByPlaceholderText('Add a comment...'));
        const textarea = within(container).getByPlaceholderText('Add a comment...') as HTMLTextAreaElement;
        await fireEvent.input(textarea, { target: { value: 'My new comment' } });
        await fireEvent.click(within(container).getByText('Post Comment'));
        await waitFor(() =>
            expect(mockPublishComment).toHaveBeenCalledWith(
                'boardpubkey',
                'card-dtag',
                'card-event-id',
                'My new comment',
            )
        );
    });

    it('reloads comments after posting (calls loadCommentsForCard twice)', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByPlaceholderText('Add a comment...'));
        const textarea = within(container).getByPlaceholderText('Add a comment...') as HTMLTextAreaElement;
        await fireEvent.input(textarea, { target: { value: 'hello' } });
        await fireEvent.click(within(container).getByText('Post Comment'));
        await waitFor(() => expect(mockLoadCommentsForCard).toHaveBeenCalledTimes(2));
    });

    it('shows Reply button for each top-level comment when logged in', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'c1', pubkey: 'p1', content: 'A comment', created_at: 1700000000, parentId: null, parentType: 'card' },
        ]);
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByText('Reply'));
    });

    it('does NOT show Reply button when readOnly=true', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'c1', pubkey: 'p1', content: 'A comment', created_at: 1700000000, parentId: null, parentType: 'card' },
        ]);
        const { container } = renderCardDetails({ readOnly: true });
        await waitFor(() => within(container).getByText('A comment'));
        expect(within(container).queryByText('Reply')).toBeNull();
    });

    it('clicking Reply shows a reply textarea', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'c1', pubkey: 'p1', content: 'A comment', created_at: 1700000000, parentId: null, parentType: 'card' },
        ]);
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByText('Reply'));
        await fireEvent.click(within(container).getByText('Reply'));
        await waitFor(() => within(container).getByPlaceholderText('Write a reply...'));
    });

    it('clicking Post Reply calls publishComment with parentCommentEventId', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'cmt-parent-id', pubkey: 'author-pubkey', content: 'Parent comment', created_at: 1700000000, parentId: null, parentType: 'card' },
        ]);
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByText('Reply'));
        await fireEvent.click(within(container).getByText('Reply'));
        await waitFor(() => within(container).getByPlaceholderText('Write a reply...'));
        const replyTextarea = within(container).getByPlaceholderText('Write a reply...') as HTMLTextAreaElement;
        await fireEvent.input(replyTextarea, { target: { value: 'My reply text' } });
        await fireEvent.click(within(container).getByText('Post Reply'));
        await waitFor(() =>
            expect(mockPublishComment).toHaveBeenCalledWith(
                'boardpubkey',
                'card-dtag',
                'card-event-id',
                'My reply text',
                'cmt-parent-id',
                'author-pubkey',
            )
        );
    });

    it('clicking Cancel hides the reply form', async () => {
        mockNdkStore.set({ user: { pubkey: 'user-pubkey' }, loginMethod: 'nip07' });
        mockLoadCommentsForCard.mockResolvedValue([
            { id: 'c1', pubkey: 'p1', content: 'A comment', created_at: 1700000000, parentId: null, parentType: 'card' },
        ]);
        const { container } = renderCardDetails({ readOnly: false });
        await waitFor(() => within(container).getByText('Reply'));
        await fireEvent.click(within(container).getByText('Reply'));
        const replyTextarea = await waitFor(() => within(container).getByPlaceholderText('Write a reply...'));
        // Scope Cancel click to the reply-form to avoid collision with the footer Cancel button
        const replyForm = replyTextarea.closest('.reply-form')!;
        await fireEvent.click(within(replyForm as HTMLElement).getByText('Cancel'));
        await waitFor(() => expect(within(container).queryByPlaceholderText('Write a reply...')).toBeNull());
    });
});
