import { writable, get } from 'svelte/store';
import NDK, { NDKEvent, NDKUser, type NDKFilter, type NDKKind } from '@nostr-dev-kit/ndk';

export interface KanbanBoard {
    id: string;
    pubkey: string;
    title: string;
    description: string;
    columnMapping: string;
    columns: Column[];
    isNoZapBoard: boolean;
}

export interface Column {
    id: string;
    name: string;
    order: number;
}

export interface Card {
    id: string;
    dTag: string;
    pubkey: string;
    title: string;
    description: string;
    status: string;
    order: number;
    attachments?: string[];
    assignees?: string[]; // Array of nostr pubkeys (from zap tags)
    created_at: number;
}

interface KanbanState {
    boards: KanbanBoard[];
    myBoards: KanbanBoard[];
    cards: Map<string, Card[]>;
    loading: boolean;
    currentUser: NDKUser | null;
    error: string | null;
}

function createKanbanStore() {
    const { subscribe, set, update } = writable<KanbanState>({
        boards: [],
        myBoards: [],
        cards: new Map(),
        loading: false,
        currentUser: null,
        error: null,
    });

    let ndk: NDK;

    function hasNDK(){
        return ndk !== undefined;
    }

    function init(ndkInstance: NDK) {
        if (!ndkInstance) {
            throw new Error('NDK instance is required');
        }
        ndk = ndkInstance;
    }

    async function loadBoards() {
        console.log("Loading boards");
        update(state => ({ ...state, loading: true, error: null }));
        
        try {
            const filter: NDKFilter = {
                kinds: [30301 as NDKKind],                
                limit: 500
            };

            const events = await ndk.fetchEvents(filter);
            console.log(events.size);
            const boards: KanbanBoard[] = [];

            for (const event of events) {
                try {
                    const content = JSON.parse(event.content);
                    const titleTag = event.tags.find(t => t[0] === 'title');
                    const dTag = event.tags.find(t => t[0] === 'd');
                    boards.push({
                        id: dTag ? dTag[1] : event.id,
                        pubkey: event.pubkey,
                        title: titleTag ? titleTag[1] : 'Untitled Board',
                        description: content.description,
                        columnMapping: content.columnMapping || 'EXACT',
                        columns: content.columns,
                        isNoZapBoard: content.isNoZapBoard || false
                    });
                } catch (error) {
                    console.error('Failed to parse board event:', error);
                }
            }

            console.log('Loaded boards:', boards);
            update(state => ({
                ...state,
                boards,
                loading: false
            }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load boards';
            update(state => ({
                ...state,
                loading: false,
                error: errorMessage
            }));
            throw error;
        }
    }

    async function loadCardsForBoard(boardId: string) {
        try {
            // First get the board to get the card references
            const boardFilter: NDKFilter = {
                kinds: [30301 as NDKKind],
                '#d': [boardId]
            };

            const boardEvents = await ndk.fetchEvents(boardFilter);
            const boardEvent = Array.from(boardEvents)[0];
            if (!boardEvent) {
                console.error('Board not found');
                return;
            }

            // Get all card references from the board's 'a' tags
            const cardRefs = boardEvent.tags
                .filter(t => t[0] === 'a')
                .map(t => {
                    const [kind, pubkey, identifier] = t[1].split(':');
                    return { kind, pubkey, identifier };
                });

            if (cardRefs.length === 0) {
                update(state => {
                    const newCards = new Map(state.cards);
                    newCards.set(boardId, []);
                    return {
                        ...state,
                        cards: newCards
                    };
                });
                return;
            }

            // Fetch all cards by their identifiers
            const cardFilter: NDKFilter = {
                kinds: [30302 as NDKKind],
                authors: cardRefs.map(ref => ref.pubkey),
                '#d': cardRefs.map(ref => ref.identifier)
            };

            const events = await ndk.fetchEvents(cardFilter);
            const cards: Card[] = [];

            for (const event of events) {
                try {
                    const content = JSON.parse(event.content);
                    const titleTag = event.tags.find(t => t[0] === 'title');
                    const dTagFullForm = event.tags.find(t => t[0] === 'd');
                    const dTag = dTagFullForm ? dTagFullForm[1] : undefined;
                    cards.push({
                        pubkey: event.pubkey,
                        id: event.id,
                        dTag: dTag!,
                        title: titleTag ? titleTag[1] : 'Untitled Card',
                        description: content.description,
                        status: content.status,
                        order: content.order,
                        attachments: content.attachments || [],
                        created_at: event.created_at!
                    });
                } catch (error) {
                    console.error('Failed to parse card event:', error);
                }
            }

            update(state => {
                const newCards = new Map(state.cards);
                newCards.set(boardId, cards);
                return {
                    ...state,
                    cards: newCards
                };
            });
        } catch (error) {
            console.error('Failed to load cards:', error);
        }
    }

    async function createBoard(title: string, description: string, columns: Column[]) {
        try {
            const event = new NDKEvent(ndk);
            event.kind = 30301 as NDKKind;
            event.content = JSON.stringify({
                description,
                columnMapping: 'EXACT',
                columns
            });
            
            event.tags = [
                ['d', crypto.randomUUID()],
                ['title', title]
            ];

            await event.publish();
            console.log('Board created successfully');
            
            await Promise.all([loadBoards(), loadMyBoards()]);
        } catch (error) {
            console.error('Failed to create board:', error);
            throw error;
        }
    }

    async function createCard(boardId: string, card: Omit<Card, 'id'>) {
        try {
            // Find the board event
            const boardFilter: NDKFilter = {
                kinds: [30301 as NDKKind],
                '#d': [boardId]
            };

            const boardEvents = await ndk.fetchEvents(boardFilter);
            const boardEvent = Array.from(boardEvents)[0];
            if (!boardEvent) {
                throw new Error('Board not found');
            }

            const currentUser = await ndk.signer?.user();
            if (!currentUser) {
                throw new Error('User not found');
            }
            if (currentUser.pubkey !== boardEvent.pubkey) {
                throw new Error('You do not have permission to update this board');
            }

            // Create the card event
            const cardEvent = new NDKEvent(ndk);
            cardEvent.kind = 30302 as NDKKind;
            
            const cardContent = {
                status: card.status,
                description: card.description,
                order: card.order,
                attachments: card.attachments || []
            };
            
            const cardIdentifier = crypto.randomUUID();
            cardEvent.content = JSON.stringify(cardContent);
            cardEvent.tags = [
                ['d', cardIdentifier],
                ['title', card.title]
            ];

            await cardEvent.publish();

            

            // Create a new board event with the updated card list
            const newBoardEvent = new NDKEvent(ndk);
            newBoardEvent.kind = 30301 as NDKKind;
            newBoardEvent.content = boardEvent.content;

            // Copy existing tags except 'a' tags
            newBoardEvent.tags = [
                ...boardEvent.tags.filter(t => t[0] !== 'a'),
                // Add reference to the new card
                ['a', `30302:${cardEvent.pubkey}:${cardIdentifier}`]
            ];

            // Add back all existing card references
            const existingCardRefs = boardEvent.tags.filter(t => t[0] === 'a');
            newBoardEvent.tags.push(...existingCardRefs);

            await newBoardEvent.publish();

            // Update local store
            update(state => {
                const newCards = new Map(state.cards);
                const cards = newCards.get(boardId) || [];
                cards.push({
                    id: newBoardEvent.id,
                    dTag: cardIdentifier,
                    pubkey: cardEvent.pubkey,
                    title: card.title,
                    description: card.description,
                    status: card.status,
                    order: card.order,
                    attachments: card.attachments,
                    created_at: cardEvent.created_at!
                });
                newCards.set(boardId, cards);
                return {
                    ...state,
                    cards: newCards
                };
            });
        } catch (error) {
            console.error('Failed to create card:', error);
            throw error; // Re-throw the error so it can be caught by the component
        }
    }

    async function findNDKCardEventByDtag(dTag: string){
        const cardFilter: NDKFilter = {
            kinds: [30302 as NDKKind],
            '#d': [dTag]
        };

        const events = await ndk.fetchEvents(cardFilter);
        if(events.size > 0){
            return Array.from(events)[0];
        }
    }

    function calculateNewOrder(cards: Card[], cardId: string, targetStatus: string, targetIndex: number): number {
        // Filter cards in the same column
        const columnCards = cards
            .filter(c => c.status === targetStatus && c.id !== cardId)
            .sort((a, b) => a.order - b.order);

        if (columnCards.length === 0) {
            return 10; // First card in column
        }

        if (targetIndex === 0) {
            // Moving to the start
            return columnCards[0].order - 10;
        }

        if (targetIndex >= columnCards.length) {
            // Moving to the end
            return columnCards[columnCards.length - 1].order + 10;
        }

        // Calculate order between two cards
        const prevCard = columnCards[targetIndex - 1];
        const nextCard = columnCards[targetIndex];
        return prevCard.order + (nextCard.order - prevCard.order) / 2;
    }

    async function updateCard(boardId: string, card: Card, targetIndex?: number) {
        try {
            console.log("Updating card with id: ", card.id);

            const currentUser = await ndk.signer?.user();
            if (!currentUser) {
                throw new Error('User not found');
            }
            if (currentUser.pubkey !== card.pubkey) {
                throw new Error('You do not have permission to update this board');
            }

            const cardEvent = await findNDKCardEventByDtag(card.dTag);
            if (!cardEvent) {
                throw new Error('Card not found');
            }

            // Get current cards to calculate new order if needed
            let newOrder = card.order;
            if (targetIndex !== undefined) {
                const currentState = get(kanbanStore);
                const currentCards = currentState.cards.get(boardId) || [];
                newOrder = calculateNewOrder(currentCards, card.id, card.status, targetIndex);
            }
            
            const cardContent = {
                status: card.status,
                description: card.description,
                order: newOrder,
                attachments: card.attachments || []
            };
            
            cardEvent.content = JSON.stringify(cardContent);
            cardEvent.tags = [
                ['d', cardEvent.tags.find(t => t[0] === 'd')![1]],
                ['title', card.title]
            ];

            await cardEvent.publishReplaceable();

            // Update the local store
            update(state => {
                const newCards = new Map(state.cards);
                const cards = newCards.get(boardId) || [];
                const cardIndex = cards.findIndex(c => c.id === card.id);
                if (cardIndex !== -1) {
                    cards[cardIndex] = {
                        ...card,
                        order: newOrder
                    };
                }
                newCards.set(boardId, cards);
                return {
                    ...state,
                    cards: newCards
                };
            });
        } catch (error) {
            console.error('Failed to update card:', error);
            throw error;
        }
    }

    async function loadBoardByPubkeyAndId(pubkey: string, boardId: string): Promise<KanbanBoard | null> {
        try {
            const filter: NDKFilter = {
                kinds: [30301 as NDKKind],
                authors: [pubkey],
                '#d': [boardId]
            };

            const events = await ndk.fetchEvents(filter);
            let board: KanbanBoard | null = null;

            for await (const event of events) {
                try {
                    const content = JSON.parse(event.content);
                    const titleTag = event.tags.find(t => t[0] === 'title');
                    const dTag = event.tags.find(t => t[0] === 'd');
                    board = {
                        id: dTag ? dTag[1] : event.id,
                        pubkey: event.pubkey,
                        title: titleTag ? titleTag[1] : 'Untitled Board',
                        description: content.description,
                        columnMapping: content.columnMapping || 'EXACT',
                        columns: content.columns,
                        isNoZapBoard: content.isNoZapBoard || false
                    };
                    break; // We only need the first matching board
                } catch (error) {
                    console.error('Failed to parse board event:', error);
                }
            }

            if (board) {
                await loadCardsForBoard(board.id);
            }

            return board;
        } catch (error) {
            console.error('Failed to load board:', error);
            throw error;
        }
    }

    async function updateBoard(board: KanbanBoard) {
        try {
            const currentUser = await ndk.signer?.user();
            if (!currentUser) {
                throw new Error('User not found');
            }
            if (currentUser.pubkey !== board.pubkey) {
                throw new Error('You do not have permission to update this board');
            }

            const boardFilter: NDKFilter = {
                kinds: [30301 as NDKKind],
                authors: [board.pubkey],
                '#d': [board.id]
            };

            const events = await ndk.fetchEvents(boardFilter);
            const boardEvent = Array.from(events)[0];
            if (!boardEvent) {
                throw new Error('Board not found');
            }

            const content = JSON.parse(boardEvent.content);
            content.description = board.description;

            const newBoardEvent = new NDKEvent(ndk);
            newBoardEvent.kind = 30301 as NDKKind;
            newBoardEvent.content = JSON.stringify({
                columns: board.columns,
                columnMapping: board.columnMapping,
                description: board.description,
            });
            newBoardEvent.tags = [
                ['d', board.id],
                ['title', board.title]
            ];

            //copy all 'a' tags
            const existingCardRefs = boardEvent.tags.filter(t => t[0] === 'a');
            newBoardEvent.tags.push(...existingCardRefs);

            await newBoardEvent.publishReplaceable();

            // Update local store
            update(state => ({
                ...state,
                boards: state.boards.map(b => 
                    b.id === board.id ? board : b
                ),
                myBoards: state.myBoards.map(b => b.id === board.id ? board : b)
            }));
        } catch (error) {
            console.error('Failed to update board:', error);
            throw error; // Re-throw the error so it can be caught by the component
        }
    }

    async function loadMyBoards() {
        update(state => ({ ...state, loading: true, error: null }));
        
        try {
            const currentUser = await ndk.signer?.user();
            if (!currentUser) {
                throw new Error('User not found');
            }

            const filter: NDKFilter = {
                kinds: [30301 as NDKKind],
                authors: [currentUser.pubkey],
                limit: 500
            };

            const events = await ndk.fetchEvents(filter);
            const myBoards: KanbanBoard[] = [];

            for (const event of events) {
                try {
                    const content = JSON.parse(event.content);
                    const titleTag = event.tags.find(t => t[0] === 'title');
                    const dTag = event.tags.find(t => t[0] === 'd');
                    myBoards.push({
                        id: dTag ? dTag[1] : event.id,
                        pubkey: event.pubkey,
                        title: titleTag ? titleTag[1] : 'Untitled Board',
                        description: content.description,
                        columnMapping: content.columnMapping || 'EXACT',
                        columns: content.columns,
                        isNoZapBoard: content.isNoZapBoard || false
                    });
                } catch (error) {
                    console.error('Failed to parse board event:', error);
                }
            }

            update(state => ({
                ...state,
                myBoards,
                loading: false
            }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load my boards';
            update(state => ({
                ...state,
                loading: false,
                error: errorMessage
            }));
            throw error;
        }
    }

    

    return {
        subscribe,
        init,
        loadBoards,
        loadMyBoards,
        loadCardsForBoard,
        createBoard,
        createCard,
        loadBoardByPubkeyAndId,
        updateBoard,
        updateCard,
        hasNDK,
    };
}

export const kanbanStore = createKanbanStore(); 