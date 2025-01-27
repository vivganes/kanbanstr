import { writable, get } from 'svelte/store';
import NDK, { NDKEvent, NDKUser, type NDKFilter, type NDKKind, type NDKTag } from '@nostr-dev-kit/ndk';
import KanbanMigrationUtil from '../utils/MigrationUtilV1';
import { ndkInstance } from '../ndk';

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

export enum BoardListType {
    MyBoards = 'My Boards',
    MaintainingBoards = 'Boards I maintain',
    All = 'All Boards',
}

export interface Column {
    id: string;
    name: string;
    order: number;
}

export interface Card {
    id: string;
    naddr: string;
    dTag: string;
    pubkey: string;
    title: string;
    description: string;
    status?: string;
    order: number;
    attachments?: string[];
    assignees?: string[]; // Array of nostr pubkeys (from p tags)
    tTags?: string[]; //Array of tags pointing to the particular card
    linkedCards?: CardLink[]; //Array of links originating from the particular card
    created_at: number;
    aTags?: string[]; // Array of a tags pointing to boards
    trackingKind?: number;
    trackingRef?: { boardATag?: string, cardDTag?: string, eventId?:string };
    content?: string;
}

export interface CardLink{
    boardPubKey: string;
    boardDTag: string;
    boardTitle?: string;
    cardDTag: string;
    linkType: LinkType;
    cardTitle?: string;
    cardStatus?: string;
}

interface LinkType{
    forwardLabel: string;
    backwardLabel: string;
}

interface KanbanState {
    boards: KanbanBoard[];
    myBoards: KanbanBoard[];
    maintainingBoards: KanbanBoard[];
    cards: Map<string, Card[]>;
    loading: boolean;
    currentUser: NDKUser | null;
    error: string | null;
}

function createKanbanStore() {
    const { subscribe, set, update } = writable<KanbanState>({
        boards: [],
        myBoards: [],
        maintainingBoards: [],
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

    async function loadBoards(boardListType: BoardListType = BoardListType.All) {
        update(state => ({ ...state, loading: true, error: null }));
        
        try {
            let filter: NDKFilter = {
                kinds: [30301 as NDKKind],                
                limit: 500,
            };
            if(boardListType === BoardListType.MyBoards){
                filter = {
                    ...filter,
                    authors: [ndk.activeUser?.pubkey!],
                }
            } else if (boardListType === BoardListType.MaintainingBoards){
                filter = {
                    ...filter,
                    '#p': [ndk.activeUser?.pubkey!],
                }
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

            if(boardListType === BoardListType.MyBoards){
                update(state => ({
                    ...state,
                    myBoards: boards,
                    loading: false
                }));
            } else if(boardListType === BoardListType.MaintainingBoards){
                update(state => ({
                    ...state,
                    maintainingBoards: boards,
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
            maintainingBoards: [],
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
                    const naddr = event.encode();
                    
                    const assignees = event.tags
                        .filter(t => t[0] === 'zap')
                        .map(t => t[1]);

                    cards.push({
                        pubkey: event.pubkey,
                        id: event.id,
                        naddr: naddr,
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

            //dedupe card events which have the same d tag and keep only the latest using created_at timestamp
            const dedupedEvents = dedupeEventsBasedOnDTag(events);

            for (const event of dedupedEvents) {
                try {
                    //get dTags
                    const originalEventDTag = event.tags.find(t => t[0] === 'd');
                    let eventToLoad: NDKEvent|undefined = event;
                    // get event's k tag
                    const kTag = event.tags.find(t => t[0] === 'k');
                    let trackingRef, trackingKind;
                    
                    if(kTag){
                        const trackedEventOutput = await loadTrackedEvent(kTag, event);
                        if(trackedEventOutput){
                            eventToLoad = trackedEventOutput.eventToLoad;
                            trackingRef = trackedEventOutput.trackingRef;
                            trackingKind = Number.parseInt(kTag[1]);
                        } else{
                            continue;
                        }
                    }
                    if(!eventToLoad){
                        continue;
                    }                    
                    if(kTag){
                        switch(kTag[1]){
                            case '30302':
                                await loadKanbanCardToBoard(eventToLoad, boardCards, event, originalEventDTag, trackingRef, trackingKind);
                                break;
                            case '1621':
                            case '1617':
                                await loadGitCardToBoard(eventToLoad, boardCards, event, originalEventDTag, trackingRef, trackingKind);
                                break;
                            default:
                                console.log('Unsupported kind:', kTag[1]);
                                break;
                        }
                    } else {
                        loadKanbanCardToBoard(eventToLoad, boardCards, event, originalEventDTag, trackingRef, trackingKind);
                    }                   
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

    async function loadGitCardToBoard(eventToLoad: NDKEvent, boardCards: Card[], event: NDKEvent, originalEventDTag: NDKTag | undefined, trackingRef: any, trackingKind: number | undefined){
        const subjectTag = eventToLoad.tags.find(t => t[0] === 'subject');
        const altTag = eventToLoad.tags.find(t => t[0] === 'alt');
        const descriptionTag = eventToLoad.tags.find(t => t[0] === 'description');
        const naddr = event.encode();
        const status = await getStatusOfIssueWithEventId(eventToLoad.id, trackingKind);

        boardCards.push({
            id: event.id,   
            naddr: naddr,         
            dTag: originalEventDTag ? originalEventDTag[1]! : event.id,
            pubkey: eventToLoad.pubkey,
            description: '',
            title: subjectTag ? subjectTag[1] : 
                        (altTag? altTag[1]: 
                            (descriptionTag? descriptionTag[1]: 'Untitled')
                        ),
            status: status,
            assignees: [eventToLoad.pubkey],
            order: 0,
            trackingKind: trackingKind,
            trackingRef: trackingRef,
            created_at: eventToLoad.created_at!
        })
    }

    async function getStatusOfIssueWithEventId(id: string, eventKind: NDKKind = 1621 as NDKKind){
        const filter = {
            kinds: [1630 as NDKKind,1631 as NDKKind,1632 as NDKKind,1633 as NDKKind],
            '#e': [id]
        };
        const statusEvents = await ndk.fetchEvents(filter);
        if(statusEvents && statusEvents.size > 0){
            const filteredEventsWithEAsRoot = Array.from(statusEvents).filter(event => {
                if(event.tags.find(t => t[0] === 'e')![1] && event.tags.find(t => t[0] === 'e')![1] === id &&
                    event.tags.find(t => t[0] === 'e')![2] && event.tags.find(t => t[0] === 'e')![2] === 'root'){
                    return true;
                }
                return false;            
            });
            if(filteredEventsWithEAsRoot.length > 0){
                const latestEvent = filteredEventsWithEAsRoot.reduce((a, b) => a.created_at! > b.created_at! ? a : b);
                const statusKind = latestEvent.kind;
                return getGitIssueStatusTextFromKind(statusKind!, eventKind);
                
            }        
        }
        return 'Open';
    }

    function getGitIssueStatusTextFromKind(kind: number, eventKind: NDKKind){
        switch(kind){
            case 1630:
                return 'Open';
            case 1631:
                return (eventKind=== 1621 as NDKKind) ?'Resolved': 'Merged';
            case 1632:
                return 'Closed';
            case 1633:
                return 'Draft';
            default:
                return 'Open';
        }
    }

    async function getSingleCard(boardPubKey:string, boardDTag:string, cardId:string): Promise<Card|void>{
        // construct `a` tag from boardPubKey and boardDTag
        const aTag = `30301:${boardPubKey}:${boardDTag}`;
        // fetch card event
        const cardFilter: NDKFilter = {
            kinds: [30302 as NDKKind],
            '#d': [cardId],
            '#a': [aTag]
        };
        const cardEvents = await ndk.fetchEvents(cardFilter);
        if (!cardEvents) {
            console.error('Card not found');
            return;
        }
        const latestCardEvent = Array.from(cardEvents).reduce((a, b) => a.created_at! > b.created_at! ? a : b);
        const titleTag = latestCardEvent.tags.find(t => t[0] === 'title');
        const statusTag = latestCardEvent.tags.find(t => t[0] === 's');
        const descriptionTag = latestCardEvent.tags.find(t => t[0] === 'description');
        return {
            id: latestCardEvent.id,
            naddr: latestCardEvent.encode(),
            dTag: cardId,
            pubkey: latestCardEvent.pubkey,
            title: titleTag ? titleTag[1] : 'Untitled Card',
            description: descriptionTag ? descriptionTag[1] : '',
            status: statusTag ? statusTag[1] : 'To Do',
            order: 0,
            created_at: latestCardEvent.created_at!
        }
    }

    

    async function loadKanbanCardToBoard(eventToLoad: NDKEvent, boardCards: Card[], event: NDKEvent, originalEventDTag: NDKTag | undefined, trackingRef: any, trackingKind: number | undefined) {
        const titleTag = eventToLoad.tags.find(t => t[0] === 'title');
        const descTag = eventToLoad.tags.find(t => t[0] === 'description');
        const statusTag = eventToLoad.tags.find(t => t[0] === 's');
        const rankTag = eventToLoad.tags.find(t => t[0] === 'rank');
        const naddr = event.encode();

        // Get attachments from u tags
        const attachments = eventToLoad.tags
            .filter(t => t[0] === 'u')
            .map(t => t[1]);

        // Get assignees from p or zap tags
        const assignees = eventToLoad.tags
            .filter(t => (t[0] === 'p' || t[0] === 'zap'))
            .map(t => t[1]);

        // Get all a tags
        const aTags = eventToLoad.tags
            .filter(t => t[0] === 'a')
            .map(t => t[1]);
        
        //Get all t tags
        const tTags = eventToLoad.tags
            .filter(t => t[0] === 't')
            .map(t => t[1]);

        //Get all refs/link tags
        const refsLinkTags = await eventToLoad.tags
            .filter(t => t[0] === 'refs/link')
            .map(async t => {
                const [boardPubKey, boardDTag, cardDTag] = t[1].split(':');
                const [forwardLabel, backwardLabel] = t.slice(2);
                //get board title
                const boardFilter: NDKFilter = {
                    kinds: [30301 as NDKKind],
                    '#d': [boardDTag]
                };
                const boardEvents = await ndk.fetchEvents(boardFilter);
                if (!boardEvents) {
                    console.error('Board not found');
                    return;
                }
                const boardEvent = Array.from(boardEvents)[0];
                const titleTag = boardEvent.tags.find(t => t[0] === 'title');
                const boardTitle = titleTag ? titleTag[1] : 'Untitled Board';
                //get card title and status
                const cardFilter: NDKFilter = {
                    kinds: [30302 as NDKKind],
                    '#d': [cardDTag]
                };
                const cardEvents = await ndk.fetchEvents(cardFilter);
                if (!cardEvents) {
                    console.error('Card not found');
                    return;
                }
                const latestCardEvent = Array.from(cardEvents).reduce((a, b) => a.created_at! > b.created_at! ? a : b);
                const cardTitleTag = latestCardEvent.tags.find(t => t[0] === 'title');
                const cardStatusTag = latestCardEvent.tags.find(t => t[0] === 's');
                const cardTitle = cardTitleTag ? cardTitleTag[1] : 'Untitled Card';
                const cardStatus = cardStatusTag ? cardStatusTag[1] : 'To Do';



                return {
                    boardPubKey,
                    boardDTag,
                    cardDTag,
                    linkType: {
                        forwardLabel,
                        backwardLabel
                    },
                    boardTitle,
                    cardTitle,
                    cardStatus
                };
            });

        boardCards.push({
            id: event.id,
            naddr:naddr,
            dTag: originalEventDTag ? originalEventDTag[1]! : event.id,
            pubkey: eventToLoad.pubkey,
            title: titleTag ? titleTag[1] : 'Untitled Card',
            description: descTag ? descTag[1] : '',
            status: statusTag ? statusTag[1] : 'To Do',
            order: rankTag ? parseInt(rankTag[1]) : 0,
            attachments,
            assignees,
            created_at: eventToLoad.created_at!,
            aTags,
            tTags,
            trackingRef: trackingRef,
            trackingKind: trackingKind,
            linkedCards: refsLinkTags
        });
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

    async function createCard(aTagPointingToBoard: string, card: Card) {
        try {
           
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
                ['rank', (card.order).toString()], // Rank tag for ordering
                // Add board reference
                ['a', aTagPointingToBoard]
            ];
            
            if(card.status){
                cardEvent.tags.push(['s', card.status]);
            }

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
                    cardEvent.tags.push(['p',assignee]);
                });
            }

            // Add card links as refs/link tags
            if (card.linkedCards && card.linkedCards.length > 0) {
                card.linkedCards.forEach(link => {
                    cardEvent.tags.push(['refs/link', `${link.boardPubKey}:${link.boardDTag}:${link.cardDTag}`, link.linkType.forwardLabel, link.linkType.backwardLabel]);
                });
            }

            await cardEvent.publish();
            const boardId = aTagPointingToBoard.split(':')[2];

             // Update local store
             update(state => {
                const newCards = new Map(state.cards);
                const cards = newCards.get(boardId) || [];
                cards.push({
                    id: cardEvent.id,
                    naddr: cardEvent.encode(),
                    dTag: cardIdentifier,
                    pubkey: cardEvent.pubkey,
                    title: card.title,
                    description: card.description,
                    status: card.status,
                    order: card.order,
                    attachments: card.attachments,
                    created_at: cardEvent.created_at!,
                    assignees: card.assignees,
                    aTags: [aTagPointingToBoard],
                    tTags: [],
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
                ['rank', newOrder.toString()],              
            ];
            if(card.status){
                newCardEvent.tags.push(['s', card.status]);
            }

            // Add attachment tags
            if (card.attachments && card.attachments.length > 0) {
                card.attachments.forEach(url => {
                    newCardEvent.tags.push(['u', url]);
                });
            }

            // Add card meta tags
            if (card.tTags && card.tTags.length > 0) {
                card.tTags.forEach(tag => {
                    newCardEvent.tags.push(['t', tag]);
                });
            }

            // Add assignee tags as zap tags
            if (card.assignees && card.assignees.length > 0) {
                card.assignees.forEach(assignee => {
                    newCardEvent.tags.push(['zap', assignee]);
                    newCardEvent.tags.push(['p',assignee]);
                });
            }

            // Add a tags
            if (card.aTags && card.aTags.length > 0) {
                card.aTags.forEach(aTag => {
                    newCardEvent.tags.push(['a', aTag]);
                });
            }

             // Add card links as refs/link tags
             if (card.linkedCards && card.linkedCards.length > 0) {
                card.linkedCards.forEach(link => {
                    newCardEvent.tags.push(['refs/link', `${link.boardPubKey}:${link.boardDTag}:${link.cardDTag}`, link.linkType.forwardLabel, link.linkType.backwardLabel]);
                });
            }

            await newCardEvent.publishReplaceable();

            // Update local store
            update(state => {
                const newCards = new Map(state.cards);
                const cards = newCards.get(boardId) || [];
                const updatedCards = cards.map(c => 
                    c.dTag === card.dTag ? {
                        ...card,
                        naddr: newCardEvent.encode(),
                        order: newOrder,
                        created_at: newCardEvent.created_at!,
                        id: newCardEvent.id,
                        pubkey: newCardEvent.pubkey,
                        tTags: card.tTags                       
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
        await loadBoards(BoardListType.MyBoards);
    }

    async function loadMaintainingBoards() {
        await loadBoards(BoardListType.MaintainingBoards);
    }

    function canEditCards(board: KanbanBoard, userPubkey: string): boolean {
        if (!userPubkey) return false;
        
        // Board creator can always edit
        if (board.pubkey === userPubkey) return true;
        
        // Check if user is a maintainer
        return board.maintainers?.includes(userPubkey) || false;
    }

    async function cloneCardToBoard(card: Card, targetBoardId: string) {
        try {
            const boardFilter: NDKFilter = {
                kinds: [30301 as NDKKind],
                '#d': [targetBoardId]
            };
            const boardEvents = await ndk.fetchEvents(boardFilter);
            const boardEvent = Array.from(boardEvents)[0];
            
            if (!boardEvent) {
                throw new Error('Target board not found');
            }

            const aTag = `30301:${boardEvent.pubkey}:${targetBoardId}`;

            const newCard = {
                ...card,
                status: undefined
            };

            await createCard(aTag, newCard);
        } catch (error) {
            console.error('Failed to clone card:', error);
            throw error;
        }
    }

    async function trackCardInAnotherBoard(card: Card, sourceBoardATag:string, targetBoardId: string) {
        try {

            const boardFilter: NDKFilter = {
                kinds: [30301 as NDKKind],
                '#d': [targetBoardId]
            };
            const boardEvents = await ndk.fetchEvents(boardFilter);
            const boardEvent = Array.from(boardEvents)[0];
            
            if (!boardEvent) {
                throw new Error('Target board not found');
            }

            const targetBoardATag = `30301:${boardEvent.pubkey}:${targetBoardId}`;

            const newCardEvent = new NDKEvent(ndk);
            newCardEvent.kind = 30302 as NDKKind;

            const aTag = sourceBoardATag;
            const dTag = card.dTag;

            // Add tags according to new spec
            newCardEvent.tags = [
                ['d', crypto.randomUUID()],
                ['k', "30302"],
                ['refs/board', aTag],
                ['refs/card', dTag],
                // Add a tags
                ['a', targetBoardATag]
            ];
            await newCardEvent.publish();            
        } catch (error) {
            console.error('Failed to clone card:', error);
            throw error;
        }
    }

    async function loadTrackedEvent(kTag:NDKTag, sourceEvent: NDKEvent) {
        let trackedCardEvent, trackingRef;
        if (kTag[1] === '30302') { // if the event is a card, load the card
            trackingRef = {
                boardATag: sourceEvent.tags.find(t => t[0] === 'refs/board')![1],
                cardDTag: sourceEvent.tags.find(t => t[0] === 'refs/card')![1]
            };
            const trackedCardFilter: NDKFilter = {
                kinds: [parseInt(kTag[1]) as NDKKind],
                '#d': [trackingRef.cardDTag]
            };
            const trackedCardEvents = await ndkInstance.ndk?.fetchEvents(trackedCardFilter);
            if(trackedCardEvents && trackedCardEvents.size > 0){
               
                //load the board's maintainers
                const boardFilter: NDKFilter = {
                    kinds: [30301 as NDKKind],
                    '#d': [trackingRef.boardATag.split(':')[2]]
                };
                const boardEvents = await ndkInstance.ndk?.fetchEvents(boardFilter);
                if (!boardEvents) {
                    console.error('Board not found');
                    return;
                }
                const boardEvent = Array.from(boardEvents!)[0];
                const maintainers = boardEvent.tags
                    .filter(t => t[0] === 'p')
                    .map(t => t[1]);
                // Retain only those trackedCardEvents authored by maintainers
                const maintainersSet = new Set(maintainers);
                for(const event of trackedCardEvents){
                    
                    if(!maintainersSet.has(event.pubkey) && event.pubkey !== boardEvent.pubkey){
                        trackedCardEvents.delete(event);
                    }
                }
                // get the latest trackedCardEvent by maintainers
                trackedCardEvent = Array.from(trackedCardEvents).reduce((a, b) => a.created_at! > b.created_at! ? a : b);
            } else {
                console.error('Tracked card event not found');
                return;
            }                
        } else if (kTag[1] === '1621' || kTag[1] === '1617') { // Git issue  or proposal          
            const eTag = sourceEvent.tags.find(t => t[0] === 'e');
            trackingRef = {
                eventId: eTag![1]
            }
            const trackedIssueFilter: NDKFilter = {
                'ids': [eTag![1]]
            };
            const trackedIssueEvents = await ndkInstance.ndk?.fetchEvents(trackedIssueFilter);
            if(trackedIssueEvents && trackedIssueEvents.size > 0){
                trackedCardEvent = [...trackedIssueEvents][0];
                return {trackingRef, eventToLoad: trackedCardEvent};
            }
            return;
        }           
        else {
            // TODO: load the content from tracked event
        }
        return { trackingRef, eventToLoad: trackedCardEvent };
    }
    
    function dedupeEventsBasedOnDTag(events: Set<NDKEvent>) {
        const eventsByDTag = new Map<string, NDKEvent>();
        for (const event of events) {
            const dTag = event.tags.find(t => t[0] === 'd');
            if (!dTag) continue;
    
            const existingEvent = eventsByDTag.get(dTag[1]);
            if (!existingEvent || existingEvent.created_at! < event.created_at!) {
                eventsByDTag.set(dTag[1], event);
            }
        }
    
        // Use only the latest events
        const dedupedEvents = Array.from(eventsByDTag.values());
        return dedupedEvents;
    }

    return {
        subscribe,
        init,
        clearStore,
        loadBoards,
        loadMyBoards,
        loadMaintainingBoards,
        loadCardsForBoard,
        loadCardsForLegacyBoard,
        createBoard,
        createCard,
        loadBoardByPubkeyAndId,
        updateBoard,
        updateCard,
        hasNDK,
        canEditCards,
        cloneCardToBoard,
        trackCardInAnotherBoard,
        getSingleCard
    };
}

export const kanbanStore = createKanbanStore(); 


