import { writable, get } from 'svelte/store';
import NDK, { NDKEvent, NDKUser, type NDKFilter, type NDKKind } from '@nostr-dev-kit/ndk';
import KanbanMigrationUtil from '../utils/MigrationUtilV1';

export interface KanbanBoard {
    id: string;
    pubkey: string;
    title: string;
    description: string;
    columns: Column[];
    isNoZapBoard: boolean;
    maintainers?: string[];
    needsMigration?: boolean;
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
    assignees?: string[]; // Array of nostr pubkeys (from p tags)
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

    async function loadLegacyBoards() {
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

    async function loadBoards(myBoardsOnly: boolean = false) {
        update(state => ({ ...state, loading: true, error: null }));
        
        try {
            const filter: NDKFilter = {
                kinds: [30301 as NDKKind],                
                limit: 500,
            };
            if(myBoardsOnly){
                filter.authors = [ndk.activeUser?.pubkey!];
            }

            const events = await ndk.fetchEvents(filter);
            const boards: KanbanBoard[] = [];

            for (const event of events) {
                try {
                    const hasATags = event.tags.some(t => t[0] === 'a');
                    const contentHasColumns = event.content && JSON.parse(event.content).columns;                    
                   

                    let titleTag = event.tags.find(t => t[0] === 'title');
                    let descTag = event.tags.find(t => t[0] === 'description');
                    let dTag = event.tags.find(t => t[0] === 'd');
                    
                    // Get columns from col tags
                    let columns = event.tags
                        .filter(t => t[0] === 'col')
                        .map(t => ({
                            id: t[1],
                            name: t[2],
                            order: parseInt(t[3])
                        }));
                        
                    // Check if this is a no-zap board (no maintainer zap tags)
                    let hasNoZapTag = event.tags.some(t => t[0] === 'nozap');

                    if(hasATags || contentHasColumns){
                        //legacy board
                        const eventContent = JSON.parse(event.content);
                        columns = eventContent.columns;       
                        descTag = ['description',eventContent.description];            
                    }

                    // Get maintainers from p tags
                    const maintainers = event.tags
                        .filter(t => t[0] === 'p')
                        .map(t => t[1]);

                    boards.push({
                        id: dTag ? dTag[1] : event.id,
                        pubkey: event.pubkey,
                        title: titleTag ? titleTag[1] : 'Untitled Board',
                        description: descTag ? descTag[1] : '',
                        columns,
                        isNoZapBoard: hasNoZapTag,
                        maintainers,
                        needsMigration: hasATags || contentHasColumns
                    });
                } catch (error) {
                    console.error('Failed to parse board event:', error);
                }
            }

            console.log('Loaded boards:', boards);
            if(myBoardsOnly){
                update(state => ({
                    ...state,
                    myBoards: boards,
                    loading: false
                }));
            } else{
                update(state => ({
                    ...state,
                    boards,
                    loading: false
                }));
            }            
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

    async function clearStore(){
        await update(state => ({
            boards: [],
            myBoards: [],
            cards: new Map(),
            loading: false,
            currentUser: null,
            error: null,
        }));
    }
    
    async function loadCardsForLegacyBoard(boardId: string) {
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
                    
                    const assignees = event.tags
                        .filter(t => t[0] === 'zap')
                        .map(t => t[1]);

                    cards.push({
                        pubkey: event.pubkey,
                        id: event.id,
                        dTag: dTag!,
                        title: titleTag ? titleTag[1] : 'Untitled Card',
                        description: content.description,
                        status: content.status,
                        order: content.order,
                        attachments: content.attachments || [],
                        assignees: assignees, 
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
            
            const filter: NDKFilter = {
                kinds: [30302 as NDKKind],
                '#a': [`30301:${boardEvent.pubkey}:${boardId}`]
            };

            const events = await ndk.fetchEvents(filter);
            const boardCards: Card[] = [];

            for (const event of events) {
                try {
                    const titleTag = event.tags.find(t => t[0] === 'title');
                    const descTag = event.tags.find(t => t[0] === 'description');
                    const dTag = event.tags.find(t => t[0] === 'd');
                    const statusTag = event.tags.find(t => t[0] === 's');
                    const rankTag = event.tags.find(t => t[0] === 'rank');
                    
                    // Get attachments from u tags
                    const attachments = event.tags
                        .filter(t => t[0] === 'u')
                        .map(t => t[1]);

                    // Get assignees from zap tags
                    const assignees = event.tags
                        .filter(t => t[0] === 'zap')
                        .map(t => t[1]);

                    // Handle tracker cards
                    const isTrackerCard = event.tags.some(t => t[0] === 'k');
                    if (isTrackerCard) {
                        // Implementation for tracker cards...
                        continue;
                    }

                    boardCards.push({
                        id: event.id,
                        dTag: dTag ? dTag[1] : event.id,
                        pubkey: event.pubkey,
                        title: titleTag ? titleTag[1] : 'Untitled Card',
                        description: descTag ? descTag[1] : '',
                        status: statusTag ? statusTag[1] : 'To Do',
                        order: rankTag ? parseInt(rankTag[1]) : 0,
                        attachments,
                        assignees,
                        created_at: event.created_at!
                    });
                } catch (error) {
                    console.error('Failed to parse card event:', error);
                }
            }

            update(state => {
                const newCards = new Map(state.cards);
                newCards.set(boardId, boardCards);
                return { ...state, cards: newCards };
            });
        } catch (error) {
            console.error('Failed to load cards:', error);
            throw error;
        }
    }

    async function createBoard(title: string, description: string, columns: Column[], maintainers: string[] = []) {
        try {
            const event = new NDKEvent(ndk);
            event.kind = 30301 as NDKKind;
            
            const boardId = crypto.randomUUID();
            
            event.tags = [
                ['d', boardId],
                ['title', title],
                ['description', description],
                ['alt', `A board titled ${title}`],
                ...columns.map(col => ['col', col.id, col.name, col.order.toString()]),
                // Add maintainer tags
                ...maintainers.map(maintainer => ['p', maintainer])
            ];

            await event.publish();
            console.log('Board created successfully');
            
            await Promise.all([loadBoards(), loadMyBoards()]);
        } catch (error) {
            console.error('Failed to create board:', error);
            throw error;
        }
    }

    async function createCard(boardId: string, card: Card) {
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
            // Create the card event
            const cardEvent = new NDKEvent(ndk);
            cardEvent.kind = 30302 as NDKKind;
            
            const cardIdentifier = crypto.randomUUID();
            
            // Add tags according to new spec
            cardEvent.tags = [
                ['d', cardIdentifier],
                ['title', card.title],
                ['description', card.description],
                ['alt', `A card titled ${card.title}`],
                ['s', card.status], // Status tag
                ['rank', (card.order).toString()], // Rank tag for ordering
                // Add board reference
                ['a', `30301:${boardEvent.pubkey}:${boardId}`]
            ];

            // Add attachment tags
            if (card.attachments && card.attachments.length > 0) {
                card.attachments.forEach(url => {
                    cardEvent.tags.push(['u', url]);
                });
            }

            // Add assignee tags as zap tags
            if (card.assignees && card.assignees.length > 0) {
                card.assignees.forEach(assignee => {
                    cardEvent.tags.push(['zap', assignee]);
                });
            }

            await cardEvent.publish();

             // Update local store
             update(state => {
                const newCards = new Map(state.cards);
                const cards = newCards.get(boardId) || [];
                cards.push({
                    id: boardEvent.id,
                    dTag: cardIdentifier,
                    pubkey: cardEvent.pubkey,
                    title: card.title,
                    description: card.description,
                    status: card.status,
                    order: card.order,
                    attachments: card.attachments,
                    created_at: cardEvent.created_at!,
                    assignees: card.assignees
                });
                newCards.set(boardId, cards);
                return {
                    ...state,
                    cards: newCards
                };
            });
        } catch (error) {
            console.error('Failed to create card:', error);
            throw error;
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
            // Get the original card event
            const cardFilter: NDKFilter = {
                kinds: [30302 as NDKKind],
                authors: [card.pubkey],
                '#d': [card.dTag]
            };

            const events = await ndk.fetchEvents(cardFilter);
            const originalEvent = Array.from(events)[0];
            if (!originalEvent) {
                throw new Error('Card not found');
            }

            // Create new card event
            const newCardEvent = new NDKEvent(ndk);
            newCardEvent.kind = 30302 as NDKKind;

            // If targetIndex is provided, calculate new order
            let newOrder = card.order;
            if (targetIndex !== undefined) {
                const currentCards = get(kanbanStore).cards.get(boardId) || [];
                newOrder = calculateNewOrder(currentCards, card.id, card.status, targetIndex);
            }

            // Add tags according to new spec
            newCardEvent.tags = [
                ['d', card.dTag], // Keep the same d tag for updates
                ['title', card.title],
                ['description', card.description],
                ['alt', `A card titled ${card.title}`],
                ['s', card.status],
                ['rank', newOrder.toString()],
                // Keep the same board reference
                ...originalEvent.tags.filter(t => t[0] === 'a')
            ];

            // Add attachment tags
            if (card.attachments && card.attachments.length > 0) {
                card.attachments.forEach(url => {
                    newCardEvent.tags.push(['u', url]);
                });
            }

            // Add assignee tags as zap tags
            if (card.assignees && card.assignees.length > 0) {
                card.assignees.forEach(assignee => {
                    newCardEvent.tags.push(['zap', assignee]);
                });
            }

            await newCardEvent.publish();

            // Update local store
            update(state => {
                const newCards = new Map(state.cards);
                const cards = newCards.get(boardId) || [];
                const updatedCards = cards.map(c => 
                    c.id === card.id ? {
                        ...card,
                        order: newOrder
                    } : c
                );
                newCards.set(boardId, updatedCards);
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

    async function loadLegacyBoardByPubkeyAndId(pubkey: string, boardId: string): Promise<KanbanBoard | null> {
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
                        columns: content.columns,
                        isNoZapBoard: content.isNoZapBoard || false,
                        needsMigration: true
                    };
                    break; // We only need the first matching board
                } catch (error) {
                    console.error('Failed to parse board event:', error);
                }
            }

            if (board) {               
                    await loadCardsForLegacyBoard(board.id);               
            }

            return board;
        } catch (error) {
            console.error('Failed to load board:', error);
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
                    const migrationRequired = event.tags.some(t => t[0] === 'a') || (event.content && JSON.parse(event.content).columns);
                    const titleTag = event.tags.find(t => t[0] === 'title');
                    const dTag = event.tags.find(t => t[0] === 'd');
                    let descriptionTag = event.tags.find(t => t[0] === 'description');
                    const isNoZapBoardTag = event.tags.find(t => t[0] === 'nozap');


                    if(!migrationRequired){
                        // Get columns from col tags
                        const columns = event.tags
                            .filter(t => t[0] === 'col')
                            .map(t => ({
                                id: t[1],
                                name: t[2],
                                order: parseInt(t[3])
                            }));
                        
                   
                        // Get maintainers from p tags
                        const maintainers = event.tags
                            .filter(t => t[0] === 'p')
                            .map(t => t[1]);

                        board = {
                            id: dTag ? dTag[1] : event.id,
                            pubkey: event.pubkey,
                            title: titleTag ? titleTag[1] : 'Untitled Board',
                            description: descriptionTag ? descriptionTag[1] : '',
                            columns,
                            isNoZapBoard: isNoZapBoardTag ? true : false,
                            needsMigration: migrationRequired,
                            maintainers
                        };
                    } else {
                        const oldBoard = await loadLegacyBoardByPubkeyAndId(pubkey, boardId);
                        if(oldBoard){
                            board = oldBoard;
                        }
                    }                    
                    
                    break; // We only need the first matching board
                } catch (error) {
                    console.error('Failed to parse board event:', error);
                }
            }

            if (board) {
                if(!board.needsMigration){
                    await loadCardsForBoard(board.id);
                } else {
                    await loadCardsForLegacyBoard(board.id);
                }
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

            // Create new board event
            const newBoardEvent = new NDKEvent(ndk);
            newBoardEvent.kind = 30301 as NDKKind;

            // Add tags according to new spec
            newBoardEvent.tags = [
                ['d', board.id],
                ['title', board.title],
                ['description', board.description],
                ['alt', `A board titled ${board.title}`],
                // Add column tags
                ...board.columns.map(col => ['col', col.id, col.name, col.order.toString()]),
                // Add maintainer tags
                ...(board.maintainers || []).map(maintainer => ['p', maintainer])
            ];

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
            throw error;
        }
    }

    async function loadMyBoards() {
        await loadBoards(true);
    }

    function canEditCards(board: KanbanBoard, userPubkey: string): boolean {
        if (!userPubkey) return false;
        
        // Board creator can always edit
        if (board.pubkey === userPubkey) return true;
        
        // Check if user is a maintainer
        return board.maintainers?.includes(userPubkey) || false;
    }

    async function copyCardToBoard(originalBoardId: string, card: Card, targetBoardId: string) {
        try {
            const newCard = {
                ...card,
                id: crypto.randomUUID()            
            };
    
            await createCard(targetBoardId, newCard);
        } catch (error) {
            console.error('Failed to copy card:', error);
            throw error;
        }
    }


    return {
        subscribe,
        init,
        clearStore,
        loadBoards,
        loadMyBoards,
        loadCardsForBoard,
        loadCardsForLegacyBoard,
        createBoard,
        createCard,
        loadBoardByPubkeyAndId,
        updateBoard,
        updateCard,
        hasNDK,
        canEditCards,
        copyCardToBoard
    };
}

export const kanbanStore = createKanbanStore(); 