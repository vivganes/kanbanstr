import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent, NDKKind, type NDKFilter } from "@nostr-dev-kit/ndk";

// Add this interface to track migration status
interface MigrationResult {
    success: boolean;
    error?: string;
    migratedBoardEvent?: NDKEvent;
    migratedCardEvents?: NDKEvent[];
}

// Add this utility class
class KanbanMigrationUtil {
    private ndk: NDK;

    constructor(ndk: NDK) {
        this.ndk = ndk;
    }

    async migrateBoard(oldBoardDTag: string, oldBoardPubkey: string): Promise<MigrationResult> {
        try {

            // Fetch old board event
            const boardFilter: NDKFilter = {
                kinds: [30301 as NDKKind],
                '#d': [oldBoardDTag],
                authors: [oldBoardPubkey]
            };
            const oldBoardEvents = await this.ndk.fetchEvents(boardFilter);
            if (oldBoardEvents.size === 0) {
                throw new Error('Old board event not found');
            }
            const oldBoardEvent = oldBoardEvents.values().next().value;
            
            // Create new board event
            const newBoardEvent = new NDKEvent(this.ndk);
            newBoardEvent.kind = 30301 as NDKKind;
            
            // Parse old content
            console.log("Old board event content:", oldBoardEvent.content);
            const oldContent = JSON.parse(oldBoardEvent.content);
            
            // Get existing d tag or generate new one
            const dTag = oldBoardEvent.tags.find(t => t[0] === 'd')?.[1] || crypto.randomUUID();
            
            // Get title from tags or content
            const title = oldBoardEvent.tags.find(t => t[0] === 'title')?.[1] || 'Untitled Board';
            
            // Convert old columns to new format
            const columns = oldContent.columns.map((col: any) => 
                ['col', col.id, col.name, col.order.toString()]
            );

            // Create new tags structure
            newBoardEvent.tags = [
                ['d', dTag],
                ['title', title],
                ['description', oldContent.description || ''],
                ['alt', `A board titled ${title}`],
                ...columns
            ];

            // publish the new board event
            await newBoardEvent.publishReplaceable();

            // Get all cards referenced in old board
            const cardRefs = oldBoardEvent.tags
                .filter(t => t[0] === 'a')
                .map(t => {
                    const [kind, pubkey, identifier] = t[1].split(':');
                    return { kind, pubkey, identifier };
                });

            // Migrate all referenced cards
            const migratedCards: NDKEvent[] = [];
            for (const ref of cardRefs) {
                const cardFilter: NDKFilter = {
                    kinds: [30302 as NDKKind],
                    authors: [ref.pubkey],
                    '#d': [ref.identifier]
                };

                const cardEvents = await this.ndk.fetchEvents(cardFilter);
                for (const oldCardEvent of cardEvents) {
                    console.log('Migrating card:', oldCardEvent.content);
                    const migratedCard = await this.migrateCard(oldCardEvent, newBoardEvent);
                    if (migratedCard) {
                        migratedCards.push(migratedCard);
                    }
                }
            }

            const result = {
                success: true,
                migratedBoardEvent: newBoardEvent,
                migratedCardEvents: migratedCards
            };
            console.log('Migration result:');
            console.log(JSON.stringify(result));

            // Publish all migrated cards
            if (result.migratedCardEvents) {
                await Promise.all(
                    result.migratedCardEvents.map(event => event.publishReplaceable())
                );
            }

            // wait for 5 seconds before returning the result
            await new Promise(r => setTimeout(r, 5000));

            // reload the page
            location.reload();

            return result;

        } catch (error) {
            console.error('Migration failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Migration failed'
            };
        }
    }

    private async migrateCard(oldCardEvent: NDKEvent, newBoardEvent: NDKEvent): Promise<NDKEvent | null> {
        try {
            const newCardEvent = new NDKEvent(this.ndk);
            newCardEvent.kind = 30302 as NDKKind;
            
            // Parse old content
            const oldContent = JSON.parse(oldCardEvent.content);
            
            // Get or generate d tag
            const dTag = oldCardEvent.tags.find(t => t[0] === 'd')?.[1] || crypto.randomUUID();
            
            // Get title from tags
            const title = oldCardEvent.tags.find(t => t[0] === 'title')?.[1] || 'Untitled Card';

            // Get all zap tags
            const zapTags = oldCardEvent.tags.filter(t => t[0] === 'zap');

            // Create new tags structure
            newCardEvent.tags = [
                ['d', dTag],
                ['title', title],
                ['description', oldContent.description || ''],
                ['alt', `A card titled ${title}`],
                ['s', oldContent.status || 'To Do'],
                ['rank', oldContent.order?.toString() || '0'],
                ['a', `30301:${newBoardEvent.pubkey}:${newBoardEvent.tags.find(t => t[0] === 'd')?.[1]}`]
            ];

            // Convert old attachments to u tags
            if (oldContent.attachments) {
                oldContent.attachments.forEach((url: string) => {
                    newCardEvent.tags.push(['u', url]);
                });
            }

            // add all zap tags from old event but in the new event they need to be 'p' tags
            zapTags.forEach((zapTag) => {
                newCardEvent.tags.push(['p', zapTag[1]]);
                newCardEvent.tags.push(['zap', zapTag[1]]);
            });


            return newCardEvent;
        } catch (error) {
            console.error('Card migration failed:', error);
            return null;
        }
    }

    async publishMigratedEvents(result: MigrationResult): Promise<boolean> {
        try {
            if (!result.success || !result.migratedBoardEvent) {
                return false;
            }

            // Publish new board event
            await result.migratedBoardEvent.publish();

            // Publish all migrated cards
            if (result.migratedCardEvents) {
                await Promise.all(
                    result.migratedCardEvents.map(event => event.publish())
                );
            }

            return true;
        } catch (error) {
            console.error('Failed to publish migrated events:', error);
            return false;
        }
    }
}

export default KanbanMigrationUtil;