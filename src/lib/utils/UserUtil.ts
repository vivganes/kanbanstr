import type { NDKUser } from "@nostr-dev-kit/ndk";
import { ndkInstance } from "../ndk";

class UserUtil {
    static _ndk: any;
    static async getUserWithProfileFromPubKey(pubKey: string): Promise<NDKUser> {
        if(!this._ndk) {
            this._ndk = ndkInstance;
        }
        const user = this._ndk.getUser({npub: pubKey});
        await user.fetchProfile();
        return user;
    }
}

export default UserUtil;