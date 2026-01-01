import NDK, { 
    NDKPrivateKeySigner, 
    NDKNip07Signer, 
    NDKNip46Signer,
    NDKUser,
    NDKZapper,
    type NDKSigner,
    NDKKind,
    type NDKFilter,
    NDKEvent,
    type NDKZapSplit,
    type NDKPaymentConfirmation,
    type NDKZapDetails,
    type LnPaymentInfo
} from '@nostr-dev-kit/ndk';
import { writable, type Writable } from 'svelte/store';
import { type Card } from '../stores/kanban';
import { NDKNWCWallet, NDKWebLNWallet, update} from '@nostr-dev-kit/ndk-wallet';


export type LoginMethod = 'nsec' | 'npub' | 'nip07' | 'bunker' | 'readonly';

interface NDKState {
    user: NDKUser | null;
    loginMethod: LoginMethod | null;
    isReady: boolean;
    isLoggingInNow: boolean;    
    nwcString: string | null;
    zapMethod: 'webln' | 'nwc' | undefined;
    zappingNow: boolean;
    manualZapInvoicesPending: string[] 
}

interface StoredLoginData {
    loginMethod: LoginMethod;
    nsec?: string;
    npub?: string;
    bunkerUri?: string;
}

interface StoredWalletData {    
    nwcString: string | null;
    zapMethod: 'webln' | 'nwc' | undefined;
}

const STORAGE_KEY = 'nostr_kanban_login';

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net'
];

// Store that indicates whether a bunker publish is in progress
export const bunkerPublishing: Writable<boolean> = writable(false);

class NDKInstance {
    private static instance?: NDKInstance;
    private _ndk: NDK | null = null;
    private nwcString: string | null = null;
    private zapMethod: 'webln' | 'nwc' | undefined;
    private user: NDKUser | null = null;
    private walletNdk: NDK| null = null;
    
    // Store to track login state
    private state: Writable<NDKState> = writable({
        user: null,
        loginMethod: null,
        isReady: false,
        isLoggingInNow: false,        
        nwcString: null,
        zapMethod: undefined,
        zappingNow: false,
        manualZapInvoicesPending: []
    });

    private constructor() {
        this.tryAutoLogin();
    }

    public static resetNdkInstance(){
        if(NDKInstance?.instance?._ndk){
            NDKInstance.instance._ndk = null;
        }
        NDKInstance.instance = undefined;
    }

    public async publishEvent(event: NDKEvent, publishReplaceable?: boolean): Promise<void> {
        // if bunker login, set bunkerPublishing to true
        const currentState = this.getCurrentState();
        if (currentState.loginMethod === 'bunker') {
            bunkerPublishing.set(true);
        }

        try{
            if(publishReplaceable) {
               await event.publishReplaceable();
            } else {
                await event.publish();
            }
        } finally {
            if (currentState.loginMethod === 'bunker') {
                bunkerPublishing.set(false);
            }
        }
    }

    private async tryAutoLogin() {
        const storedData = this.getStoredLoginData();
        if (!storedData) return;
        
        this.state.update(state => ({
            ...state,
            isLoggingInNow: true
        }));

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
                case 'bunker':
                    if (storedData.bunkerUri) {
                        await this.loginWithBunker(storedData.bunkerUri, storedData.nsec);
                    }
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
    private getStoredZapWalletData(): StoredWalletData {
        try {
            const zapMethodFromLocalStorage = localStorage.getItem("kanbanstr_zap_method");
            const nwcStringFromLocalStorage = localStorage.getItem("kanbanstr_nwc");
            
            if (zapMethodFromLocalStorage === 'webln' || zapMethodFromLocalStorage === 'nwc') {
                this.zapMethod = zapMethodFromLocalStorage;
            }

            if (nwcStringFromLocalStorage) {
                this.nwcString = nwcStringFromLocalStorage;
            }

            return {
                zapMethod: this.zapMethod,
                nwcString: this.nwcString
            };
        } catch (error) {
            console.error('Failed to retrieve zap wallet data:', error);
            return {
                zapMethod: undefined,
                nwcString: null
            };
        }
    }

    private async clearStoredLoginData() {
        try {
           await localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error('Failed to clear login data:', error);
        }
    }

    private async clearStoredZapWalletData() {
        try {
            await localStorage.removeItem("kanbanstr_zap_method");
            await localStorage.removeItem("kanbanstr_nwc");
        } catch (error) {
            console.error('Failed to clear zap wallet data:', error);
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
            subscribe: this.state.subscribe,
            update: this.state.update
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

    async initializeWalletForZapping(){ 
        if(this._ndk){
            if(this.zapMethod === 'nwc'){  
                this.walletNdk =  new NDK({
                    explicitRelayUrls: [this.getRelayFromNwcString(this.nwcString!)!]
                })             
                const wallet = new NDKNWCWallet(this.walletNdk,{
                    timeout:5000,
                    pairingCode: this.nwcString!
                });
                this._ndk.wallet = wallet;
                wallet.on("timeout", (method: string) => console.log('Unable to complete the operation in time', { method }))
            } else if (this.zapMethod === 'webln'){
                const wallet = new NDKWebLNWallet();
                this._ndk.wallet = wallet;
            } else {
                // no wallet. So, manual payment
                this._ndk.wallet = undefined;
                const lnPay = async (payment: NDKZapDetails<LnPaymentInfo>) => {
                    console.log('Manual payment:', payment.pr);
                    this.state.update(state => ({
                        ...state,
                        manualZapInvoicesPending: [...state.manualZapInvoicesPending, payment.pr]
                    }));
                    return undefined;
                };
                this._ndk.wallet = {lnPay};
            }          
        }  
        
        return {zapMethod: this.zapMethod, nwcString: this.nwcString};
    }

    public async setNWCString(nwcString: string|null) {
        try {
            // Here you could validate the NWC string format if needed
            this.state.update(state => ({
                ...state,
                nwcString
            }));

            // Store in localStorage for persistence
            localStorage.setItem('kanbanstr_nwc', nwcString!);
        } catch (error) {
            console.error('Failed to set NWC string:', error);
            throw error;
        }
    }

    public async setZapMethod(method: 'webln' | 'nwc' | undefined) {
        try {
            this.state.update(state => ({
                ...state,
                zapMethod: method
            }));

            // Store in localStorage
            if (method) {
                localStorage.setItem('kanbanstr_zap_method', method);
            } else {
                localStorage.removeItem('kanbanstr_zap_method');
            }
        } catch (error) {
            console.error('Failed to set zap method:', error);
            throw error;
        }
    }

    getRelayFromNwcString(nwcString: string): string | undefined {
        const u = new URL(nwcString);
        return u.searchParams.get('relay') || undefined;
    }

    async loginWithNsec(nsec: string): Promise<void> {
        try {
            const signer = new NDKPrivateKeySigner(nsec);
            await this.initNDK(signer);
            
            if (!this._ndk) throw new Error('NDK not initialized');

            this.getStoredZapWalletData();
            
            this.user = await signer.user();
            const user = this.user;
            await user.fetchProfile();
            console.log("Name:"+ user.profile?.displayName)
            this.state.set({
                user,
                loginMethod: 'nsec',
                isReady: true,
                isLoggingInNow: false,
                zapMethod: this.zapMethod,
                nwcString: this.nwcString,
                zappingNow: false,
                manualZapInvoicesPending: []
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
            
            this.user = this._ndk.getUser({npub});
            const user = this.user;
            await user.fetchProfile();
            this.state.set({
                user,
                loginMethod: 'npub',
                isReady: true,
                isLoggingInNow: false,                
                zapMethod: this.zapMethod,
                nwcString: this.nwcString,
                zappingNow: false,
                manualZapInvoicesPending: []
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

            this.getStoredZapWalletData();
            
            this.user = await signer.user();
            const user = this.user;
            await user.fetchProfile();
            this.state.set({
                user,
                loginMethod: 'nip07',
                isReady: true,
                isLoggingInNow: false,                
                zapMethod: this.zapMethod,
                nwcString: this.nwcString,
                zappingNow: false,
                manualZapInvoicesPending: []
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

    async loginWithBunker(bunkerUri: string, bunkerNsec?: string): Promise<void> {
        try {
            console.log("Logging in with bunker:// URI");
            this.state.update(state => ({
                ...state,
                isLoggingInNow: true
            }));
            this._ndk = new NDK({
                explicitRelayUrls: DEFAULT_RELAYS
            });
            const signer = new NDKNip46Signer(this._ndk, bunkerUri, bunkerNsec);
            this._ndk.signer = signer;
            await signer.blockUntilReady();  
            console.log("Bunker signer is ready");          
            await this._ndk.connect();

            const nsec = signer.localSigner.nsec;

            this.getStoredZapWalletData();
            
            this.user = await signer.user();
            console.log("Bunker user npub: "+ this.user.npub);
            const user = this.user;
            await user.fetchProfile();
            this.state.set({
                user,
                loginMethod: 'bunker',
                isReady: true,
                isLoggingInNow: false,                
                zapMethod: this.zapMethod,
                nwcString: this.nwcString,
                zappingNow: false,
                manualZapInvoicesPending: []
            });

            // Store login data
            this.storeLoginData({
                loginMethod: 'bunker',
                bunkerUri: bunkerUri,
                nsec,
                npub: user.npub
            });
        } catch (error) {
            console.error('Failed to connect via bunker://', error);
            this.state.update(state => ({
                ...state,
                isLoggingInNow: false,
                }));
            throw new Error('Failed to connect via bunker: ' + error );
        }
    }

    async loginReadOnly(): Promise<void> {
        try {
            const signer = NDKPrivateKeySigner.generate();
            await this.initNDK(signer);
            
            if (!this._ndk) throw new Error('NDK not initialized');
            const npub = (await signer.user()).npub;            
            this.user = this._ndk.getUser({npub});
            const user = this.user;
            this.user.profile = {
                displayName: 'Sneaky Sneakerson',
                image: 'https://robohash.org/sneaky-sneakerson'
            }
            this.state.set({
                user,
                loginMethod: 'readonly',
                isReady: true,
                isLoggingInNow: false,
                zapMethod: this.zapMethod,
                nwcString: this.nwcString,
                zappingNow: false,
                manualZapInvoicesPending:[]
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
        this.state.set({
            user: null,
            loginMethod: null,
            isReady: false,
            isLoggingInNow: true,
            nwcString: null,
            zapMethod: undefined,
            zappingNow: false,
            manualZapInvoicesPending: []
        });
        if(this.walletNdk){
            this.walletNdk = null;
        }
        if(this._ndk){
            this._ndk = null;
        }
        this.user = null;
        NDKInstance.resetNdkInstance();
        
        
        // Clear stored login data
        await this.clearStoredLoginData();
        await this.clearStoredZapWalletData();

        
        console.log("Logged out");
        location.reload();

        
    }

    canWrite(): boolean {
        const currentState = this.getCurrentState();
        return currentState.loginMethod === 'nsec' || currentState.loginMethod === 'nip07';
    }

    public getCurrentState(): NDKState {
        let currentState: NDKState = {
            user: null,
            loginMethod: null,
            isReady: false,
            isLoggingInNow: false,
            nwcString: null,
            zapMethod: undefined,
            zappingNow: false
        };
        
        this.state.subscribe(state => {
            currentState = state;
        })();
        
        return currentState;
    }

    async zapProfile(pubkey: string, amount: number, comment?: string, zapCompleteCallback?: ()=>void): Promise<boolean> {
        try {

            
            if (!this._ndk) throw new Error('NDK not initialized');
            if (!this._ndk.signer) throw new Error('No signer available');
            if(!this._ndk.wallet){
                await this.initializeWalletForZapping();
            }
            this.state.update(state => ({
                ...state,
                zappingNow: true
            }));

            const ndkUserToBeZapped = ndkInstance.ndk!.getUser({pubkey: pubkey}); 
            await this.zapUsingNDKZapper(ndkUserToBeZapped, amount, comment, zapCompleteCallback);
            return true;
        } catch (error) {
            console.error('Failed to zap profile:', error);
            throw error;
        }
    }

    async zapCard(card: Card, amount: number = 1000, comment?: string, zapCompleteCallback?: ()=>void): Promise<boolean> {
        try {

            if (!this._ndk) throw new Error('NDK not initialized');
            if (!this._ndk.signer) throw new Error('No signer available');
            if(!this._ndk.wallet){
                await this.initializeWalletForZapping();
            }
            this.state.update(state => ({
                ...state,
                zappingNow: true
            }));

            // get profile event from NDK
            const eventToBeZapped = await this._ndk.fetchEvent({
                ids: [card.id],
            });
           
            await this.zapUsingNDKZapper(eventToBeZapped, amount, comment, zapCompleteCallback);
            
            return true;
        } catch (error) {
            console.error('Failed to zap:', error);
            throw error;
        }
    }

    private async zapUsingNDKZapper(zapTargetObject: NDKEvent | NDKUser | null, amount: number, comment: string | undefined, zapCompleteCallback: (() => void) | undefined) {
        const zapper = new NDKZapper(zapTargetObject!, amount * 1000,'msat',{
            ndk: this._ndk!,
            nutzapAsFallback: false
        });

        if (comment) {
            zapper.comment = comment;
        }
        zapper.on(
            'split:complete',
            (split: NDKZapSplit, info: NDKPaymentConfirmation | Error | undefined) => {
                console.log('split:complete', split, info);
            }
        );
        zapper.on('complete', (res) => {
            console.log('complete', res);
            if(this.zapMethod){
                this.state.update(state => ({
                    ...state,
                    zappingNow: false
                }));
            };
            
            if (zapCompleteCallback) {
                zapCompleteCallback();
            }
        });

        console.log("About to zap");
        // if zapper.zap() finishes within 5 seconds, return the value to zapDatas. Else, return an empty object.
        let zapDatas;
        try {
            const zapPromise = zapper.zap();
            zapDatas = await Promise.race([
                zapPromise,
                new Promise((resolve) => setTimeout(() => resolve(new Map()), 5000))
            ]);
            if (!zapDatas) {
                zapDatas = new Map();
            }
        } catch (error) {
            console.error('Zap failed:', error);
            zapDatas = new Map();
        }

        
        //const zapDatas = await zapper.zap();
        for (let zapdata of zapDatas.keys()) {
            console.log("Zap Data: " + zapdata.pubkey);
            console.log(JSON.stringify(zapDatas.get(zapdata)));
        }
    }

    getZapAmountFromZapEvent(event: NDKEvent){
        const zapDescription = event.tags.find(t => t[0] === 'description')![1];
        const zapDescriptionObj = JSON.parse(zapDescription);
        const zapAmount = zapDescriptionObj.tags.find(t => t[0] === 'amount')![1];
        return parseInt(zapAmount)/1000;
    }

    async getZapAmount(kind: NDKKind, pubkey: string, dTag: string): Promise<number> {
        try {
            if (!this._ndk) throw new Error('NDK not initialized');


            const filter: NDKFilter = {
                kinds: [9735],
                '#a': [kind + ":" + pubkey + ":" + dTag]
            };

            const events = await this._ndk.fetchEvents(filter);
            let totalAmount = 0;

            for (const event of events) {
                try {
                    totalAmount += this.getZapAmountFromZapEvent(event);
                } catch (error) {
                    console.error('Error processing zap event:', error);
                }
            }

            return totalAmount;
        } catch (error) {
            console.error('Failed to get zap amount:', error);
            return 0;
        }
    }
}

export function formatAmount(amount: number): string {
    if (amount === 0) return '0';
    
    if (amount >= 1_000_000_000) {
        return `${(amount / 1_000_000_000).toFixed(1)}B`;
    }
    if (amount >= 1_000_000) {
        return `${(amount / 1_000_000).toFixed(1)}M`;
    }
    if (amount >= 1_000) {
        return `${(amount / 1_000).toFixed(1)}k`;
    }
    return amount.toString();
}


export const ndkInstance = NDKInstance.getInstance();