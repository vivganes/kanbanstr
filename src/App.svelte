<script lang="ts">
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { ndkInstance } from './lib/ndk';
  import { bunkerPublishing } from './lib/ndk';
  import type { NDKUser } from '@nostr-dev-kit/ndk';
  import Login from './lib/components/Login.svelte';
  import BoardsList from './lib/components/BoardsList.svelte';
  import BoardView from './lib/components/BoardView.svelte';
  import Settings from './lib/components/Settings.svelte';
  import ConsentModal from './lib/components/ConsentModal.svelte';
  import ToastContainer from './lib/components/ToastContainer.svelte';
  import DonationPopup from './lib/components/DonationPopup.svelte';
  import ManualZapPopup from './lib/components/ManualZapPopup.svelte';

  let user: NDKUser | null = null;
  let loginMethod: string | null = null;
  let isReady = false;
  let manualZapInvoicesPending: string[] = [];
  let zapMethod: "webln" | "nwc" | undefined = undefined;
  let zappingNow = false;
  let bunkerPubLoading = false;

  // Define routes
  const routes = {
    '/': BoardsList,
    '/board/:pubkey/:id': BoardView,
    '/board/:pubkey/:id/card/:cardDTag': BoardView, 
    '/settings': Settings
  };

  onMount(() => {
    const unsubscribe = ndkInstance.store.subscribe(state => {
      user = state.user;
      loginMethod = state.loginMethod;
      isReady = state.isReady;
      manualZapInvoicesPending =state.manualZapInvoicesPending;
      zapMethod = state.zapMethod;
      zappingNow = state.zappingNow
    });
    const unsubscribeBunker = bunkerPublishing.subscribe(v => bunkerPubLoading = v);

    return () => {
      unsubscribe();
      unsubscribeBunker();
    };
  });

  // ensure we clean up bunker subscription too
  $: if (false) {};
</script>

<main>
  <ConsentModal />
  {#if !user}
    <Login />
  {:else}
    {#if !isReady}
      <p>Loading...</p>
    {:else}
    <Router {routes} />
    {/if}
  {/if}
  <ToastContainer />
  <DonationPopup />
  {#if bunkerPubLoading}
    <div class="bunker-overlay">
      <div class="bunker-overlay__inner">⌛ Approve the event in your signer</div>
    </div>
  {/if}
  {#if zapMethod === undefined && manualZapInvoicesPending?.length > 0 && zappingNow}
    <ManualZapPopup 
      invoices={manualZapInvoicesPending}
      onClose={() => ndkInstance.store.update(state => ({ ...state, zappingNow: false, manualZapInvoicesPending: [] }))}
    />
  {/if}
</main>

<style>
  main {
    height: 100vh;
    width: 100%;
    margin: 0 auto;
  }

.bunker-overlay {
  position: fixed;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.4);
  z-index: 9999;
}
.bunker-overlay__inner {
  background: white;
  color: #111;
  padding: 12px 18px;
  border-radius: 8px;
  font-weight: 600;
}
</style>
