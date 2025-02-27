<script lang="ts">
  import { onMount } from 'svelte';
  import Router from 'svelte-spa-router';
  import { ndkInstance } from './lib/ndk';
  import type { NDKUser } from '@nostr-dev-kit/ndk';
  import Login from './lib/components/Login.svelte';
  import BoardsList from './lib/components/BoardsList.svelte';
  import BoardView from './lib/components/BoardView.svelte';
  import Settings from './lib/components/Settings.svelte';
  import ConsentModal from './lib/components/ConsentModal.svelte';
  import ToastContainer from './lib/components/ToastContainer.svelte';
  import DonationPopup from './lib/components/DonationPopup.svelte';

  let user: NDKUser | null = null;
  let loginMethod: string | null = null;
  let isReady = false;
  let manualZapInvoicesPending = [];
  let zapMethod: "webln" | "nwc" | undefined = undefined;
  let zappingNow = false;

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

    return unsubscribe;
  });
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
</main>

<style>
  main {
    height: 100vh;
    width: 100%;
    margin: 0 auto;
  }
</style>
