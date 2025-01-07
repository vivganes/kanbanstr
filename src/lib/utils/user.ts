import { ndkInstance } from '../ndk';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';

export async function getUserWithProfileFromPubKey(pubKey: string): Promise<NDKUser> {
    const user = ndkInstance.ndk!.getUser({pubkey: pubKey});
    await user.fetchProfile();
    return user;
}

export async function getUserDisplayNameByNip05(nip05: string): Promise<string> {
    try {
        const user = await ndkInstance.ndk!.getUser({ nip05 });
        await user.fetchProfile();
        if (!user.pubkey) {
            throw new Error('Invalid NIP-05 identifier');
        }
        return user?.profile?.displayName || user?.profile?.name || 'Anonymous';
    } catch (error) {
        console.error('Failed to load NIP-05 user info:', error);
        throw error;
    }
}

export async function getUserDisplayName(pubkey: string): Promise<string> {
    try {
        if (!pubkey) throw new Error('No pubkey provided');
        
        let user;
        if (pubkey.startsWith('npub')) {
            user = ndkInstance.ndk!.getUser({ npub: pubkey });
        } else {
            user = ndkInstance.ndk!.getUser({ pubkey: pubkey });
        }
        
        await user.fetchProfile();
        return user?.profile?.displayName || user?.profile?.name || 'Anonymous';
    } catch (error) {
        console.error('Failed to load user info:', error);
        throw error;
    }
}

export async function resolveIdentifier(identifier: string): Promise<string> {
    try {
        let user;
        if (identifier.includes('@')) {
            user = await ndkInstance.ndk!.getUser({ nip05: identifier });
        } else if (identifier.startsWith('npub')) {
            user = ndkInstance.ndk!.getUser({ npub: identifier });
        } else {
            user = ndkInstance.ndk!.getUser({ pubkey: identifier });
        }
        
        await user.fetchProfile();
        if (!user.pubkey) {
            throw new Error('Invalid identifier');
        }
        return user.pubkey;
    } catch (error) {
        throw error;
    }
} 