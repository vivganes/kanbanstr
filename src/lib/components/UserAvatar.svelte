<script lang="ts">
    import { onMount } from 'svelte';
    import { getUserWithProfileFromPubKey } from '../utils/user';
    import type { NDKUser } from '@nostr-dev-kit/ndk';

    export let pubkey: string;
    export let size: number = 24;
    export let prefix: string = '';

    let user: NDKUser | null = null;
    let error = false;

    onMount(async () => {
        try {
            user = await getUserWithProfileFromPubKey(pubkey);
        } catch (e) {
            error = true;
            console.error('Failed to load user:', e);
        }
    });

    $: displayName = user?.profile?.name || 'Anonymous';
    $: avatarUrl = user?.profile?.image || `https://robohash.org/${pubkey}`;
</script>

<div 
    class="avatar-wrapper" 
    style="--size: {size}px"
    title={prefix+displayName}
>
    <a href={"https://primal.net/p/"+pubkey} target="_blank">
        <img
            src={avatarUrl}
            alt={displayName}
            on:error={() => avatarUrl = `https://robohash.org/${pubkey}`}
        />
    </a>
</div>

<style>
    .avatar-wrapper {
        width: var(--size);
        height: var(--size);
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
    }

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    /* Add a subtle border in dark mode */
    @media (prefers-color-scheme: dark) {
        .avatar-wrapper {
            border: 1px solid #444;
        }
    }
</style> 