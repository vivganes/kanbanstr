<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { donationStore } from '../stores/donation';
  import UserAvatar from './UserAvatar.svelte';
  import contributors from '../data/contributors.json';
  import ZapModal from './ZapModal.svelte';
  import { ndkInstance } from '../ndk';
    import type { Card } from '../stores/kanban';

  let showZapModal = false;

  async function handleZap(amount: number, comment: string) {
    try {
      // Split the amount among contributors based on their shares
      const totalShares = contributors.contributors.reduce((sum, c) => sum + c.share, 0);
      
      for (const contributor of contributors.contributors) {
        const contributorAmount = Math.floor((amount * contributor.share) / totalShares);
        await ndkInstance.zapProfile(contributor.pubkey, contributorAmount, comment);
      }
      
      donationStore.hidePopup();
    } catch (error) {
      console.error('Failed to send zap:', error);
      throw error;
    }
  }
</script>

{#if $donationStore.showPopup}
  <div 
    class="popup-container"
    in:fly={{ y: 50, duration: 500 }}
    out:fade
  >
    <div class="popup">
      <div class="content">
        <h3>Support the Project</h3>
        <p>If you find this project useful, consider supporting the contributors with a zap ⚡</p>
        
        <div class="contributors">
          {#each contributors.contributors as contributor}
            <UserAvatar pubkey={contributor.pubkey} size={32} />
          {/each}
        </div>
      </div>
      
      <div class="actions">
        <button 
          class="ignore"
          on:click={() => donationStore.ignoreDonation()}
        >
          Ignore
        </button>
        <button 
          class="zap"
          on:click={() => showZapModal = true}
        >
          Zap ⚡
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showZapModal}
  <ZapModal
    onClose={() => showZapModal = false}
    onZap={handleZap}
  />
{/if}

<style>
  .popup-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
  }

  .popup {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    max-width: 300px;
  }

  .content {
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.2rem;
  }

  p {
    margin: 0 0 1rem 0;
    font-size: 0.9rem;
    color: #666;
  }

  .contributors {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .ignore {
    background: none;
    border: 1px solid #ddd;
  }

  .zap {
    background: #ffd700;
    border: none;
    color: black;
  }

  @media (prefers-color-scheme: dark) {
    .popup {
      background: #2d2d2d;
      color: #fff;
    }

    p {
      color: #ccc;
    }

    .ignore {
      border-color: #444;
      color: #fff;
    }
  }
</style> 