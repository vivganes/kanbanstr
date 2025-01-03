import NDK, { 
    NDKPrivateKeySigner, 
    NDKNip07Signer, 
    NDKUser,
    NDKZapper,
    type NDKSigner,
    type NDKPaymentConfirmation
} from '@nostr-dev-kit/ndk';
import { writable, type Writable } from 'svelte/store';
import type { Card } from '../stores/kanban';
import { NDKNWCWallet, NDKWebLNWallet } from '@nostr-dev-kit/ndk-wallet';

export type LoginMethod = 'nsec' | 'npub' | 'nip07' | 'readonly';

interface NDKState {
    user: NDKUser | null;
    loginMethod: LoginMethod | null;
    isReady: boolean;
}

interface StoredLoginData {
    loginMethod: LoginMethod;
    nsec?: string;
    npub?: string;
}

const STORAGE_KEY = 'nostr_kanban_login';

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol'
];

class NDKInstance {
    private static instance: NDKInstance;
    private _ndk: NDK | null = null;
    
    // Store to track login state
    private state: Writable<NDKState> = writable({
        user: null,
        loginMethod: null,
        isReady: false
    });

    private constructor() {
        this.tryAutoLogin();
    }

    private async tryAutoLogin() {
        const storedData = this.getStoredLoginData();
        if (!storedData) return;

        try {
            switch (storedData.loginMethod) {
                case 'nsec':
                    if (storedData.nsec) {
                        await this.loginWithNsec(storedData.nsec);
                    }
                    break;
                case 'npub':
                    if (storedData.npub) {
                        await this.loginWithNpub(storedData.npub);
                    }
                    break;
                case 'nip07':
                    await this.loginWithNip07();
                    break;
                case 'readonly':
                    await this.loginReadOnly();
                    break;
            }
        } catch (error) {
            console.error('Auto-login failed:', error);
            this.clearStoredLoginData();
        }
    }

    private storeLoginData(data: StoredLoginData) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to store login data:', error);
        }
    }

    private getStoredLoginData(): StoredLoginData | null {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Failed to retrieve login data:', error);
            return null;
        }
    }

    private clearStoredLoginData() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear login data:', error);
        }
    }

    public static getInstance(): NDKInstance {
        if (!NDKInstance.instance) {
            NDKInstance.instance = new NDKInstance();
        }
        return NDKInstance.instance;
    }

    get ndk(): NDK | null {
        return this._ndk;
    }

    get store() {
        return {
            subscribe: this.state.subscribe
        };
    }

    private async initNDK(signer?: NDKSigner, customRelays?: string[]) {
        console.log('Initializing NDK with customRelays: ', customRelays);
        const relayUrls = customRelays || DEFAULT_RELAYS;
        
        this._ndk = new NDK({
            explicitRelayUrls: relayUrls,
            signer
        });

        await this._ndk.connect();
    }

    async loginWithNsec(nsec: string): Promise<void> {
        try {
            const signer = new NDKPrivateKeySigner(nsec);
            await this.initNDK(signer);
            
            if (!this._ndk) throw new Error('NDK not initialized');
            
            const user = await signer.user();
            await user.fetchProfile();
            console.log("Name:"+ user.profile?.displayName)
            this.state.set({
                user,
                loginMethod: 'nsec',
                isReady: true
            });

            // Store login data
            this.storeLoginData({
                loginMethod: 'nsec',
                nsec,
                npub: user.npub
            });
        } catch (error) {
            console.error('Failed to login with nsec:', error);
            throw error;
        }
    }

    async loginWithNpub(npub: string): Promise<void> {
        try {
            await this.initNDK();
            if (!this._ndk) throw new Error('NDK not initialized');
            
            const user = this._ndk.getUser({npub});
            await user.fetchProfile();
            this.state.set({
                user,
                loginMethod: 'npub',
                isReady: true
            });

            // Store login data
            this.storeLoginData({
                loginMethod: 'npub',
                npub
            });
        } catch (error) {
            console.error('Failed to login with npub:', error);
            throw error;
        }
    }

    private async resolveNip07Extension() {
        await (async () => {
          console.log('waiting for window.nostr');          
          while (!window.hasOwnProperty('nostr')) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          console.log("Found nostr extension");
        })();
    }

    async loginWithNip07(): Promise<void> {
        try {
            const signer = new NDKNip07Signer();
            
            // Try to get relays from the extension
            let extensionRelays: string[] | undefined;
            try {
                // @ts-ignore - window.nostr is added by NIP-07 extensions
                await this.resolveNip07Extension();
                const relays = await window.nostr?.getRelays();
                if (relays && Object.keys(relays).length > 0) {
                    extensionRelays = Object.keys(relays);
                    console.log('Using relays from NIP-07 extension:', extensionRelays);
                }
            } catch (error) {
                console.warn('Failed to get relays from NIP-07 extension:', error);
                console.log('Falling back to default relays');
            }

            console.log("Relays: "+ extensionRelays)

            await this.initNDK(signer, extensionRelays);
            
            if (!this._ndk) throw new Error('NDK not initialized');
            
            const user = await signer.user();
            await user.fetchProfile();
            this.state.set({
                user,
                loginMethod: 'nip07',
                isReady: true
            });

            // Store login data
            this.storeLoginData({
                loginMethod: 'nip07',
                npub: user.npub
            });
        } catch (error) {
            console.error('Failed to login with NIP-07:', error);
            throw error;
        }
    }

    async loginReadOnly(): Promise<void> {
        try {
            const signer = NDKPrivateKeySigner.generate();
            await this.initNDK(signer);
            
            if (!this._ndk) throw new Error('NDK not initialized');
            const npub = (await signer.user()).npub;            
            const user = this._ndk.getUser({npub});
            user.profile = {
                displayName: 'Sneaky Sneakerson',
                image: 'https://robohash.org/sneaky-sneakerson'
            }
            this.state.set({
                user,
                loginMethod: 'readonly',
                isReady: true
            });

            // Store login data
            this.storeLoginData({
                loginMethod: 'readonly',
                npub: user.npub
            });
        } catch (error) {
            console.error('Failed to create read-only session:', error);
            throw error;
        }
    }

    async logout(): Promise<void> {
        this._ndk = null;
        this.state.set({
            user: null,
            loginMethod: null,
            isReady: false
        });
        
        // Clear stored login data
        this.clearStoredLoginData();
    }

    canWrite(): boolean {
        const currentState = this.getCurrentState();
        return currentState.loginMethod === 'nsec' || currentState.loginMethod === 'nip07';
    }

    private getCurrentState(): NDKState {
        let currentState: NDKState = {
            user: null,
            loginMethod: null,
            isReady: false
        };
        
        this.state.subscribe(state => {
            currentState = state;
        })();
        
        return currentState;
    }

    async zapCard(card: Card, amount: number = 1000, comment?: string) {
        try {
            if (!this._ndk) throw new Error('NDK not initialized');
            if (!this._ndk.signer) throw new Error('No signer available');

            // get card event from NDK
            const cardEvent = await this._ndk.fetchEvent({
                ids: [card.id],
            });
           
            const wallet = new NDKWebLNWallet();
            this._ndk.wallet = wallet;

            const zapper = new NDKZapper(cardEvent!, amount*1000);
            if (comment) {
                zapper.comment = comment;
            }
            const zapDatas = await zapper.zap();
            console.log('zap data: '+ zapDatas);
            for (let zapdata of zapDatas.keys()){
                console.log("Zap Data: "+ zapdata.pubkey );
                console.log(JSON.stringify(zapDatas.get(zapdata)));
            }
            
            return true;
        } catch (error) {
            console.error('Failed to zap:', error);
            throw error;
        }
    }
}

export const ndkInstance = NDKInstance.getInstance();