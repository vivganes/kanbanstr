<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import QRCode from 'qrcode';
  import { onMount } from 'svelte';

  export let invoices: string[] = [];
  export let onClose: () => void;

  let currentPage = 0;
  let qrCodes: string[] = [];
  let copySuccess = false;
  let copyTimeout: NodeJS.Timeout;

  // Generate QR codes for all invoices
  $: {
    Promise.all(invoices.map(invoice => QRCode.toDataURL(invoice)))
      .then(codes => {
        qrCodes = codes;
      });
  }

  function nextPage() {
    if (currentPage < invoices.length - 1) {
      currentPage++;
    }
  }

  function prevPage() {
    if (currentPage > 0) {
      currentPage--;
    }
  }

  async function copyInvoice() {
    try {
      await navigator.clipboard.writeText(invoices[currentPage]);
      copySuccess = true;
      
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

<div 
  class="popup-container"
  in:fly={{ y: 50, duration: 500 }}
  out:fade
>
  <div class="popup">
    <div class="content">
      <h3>Scan QR Code to Pay</h3>
      
      {#if qrCodes[currentPage]}
        <div class="qr-container">
          <img src={qrCodes[currentPage]} alt="QR Code for Lightning payment" />
        </div>
        <div class="invoice-container">
          <div class="invoice-text">
            <p class="invoice">{invoices[currentPage]}</p>
          </div>
          <button 
            class="copy-button" 
            on:click={copyInvoice}
            title="Copy invoice"
          >
            <span class="material-icons">
              {copySuccess ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      {/if}

      <div class="pagination">
        <button 
          class="nav-button"
          on:click={prevPage}
          disabled={currentPage === 0}
        >
          Previous
        </button>
        <span class="page-info">
          {currentPage + 1} / {invoices.length}
        </span>
        <button 
          class="nav-button"
          on:click={nextPage}
          disabled={currentPage === invoices.length - 1}
        >
          Next
        </button>
      </div>
    </div>
    
    <div class="actions">
      <button 
        class="done"
        on:click={onClose}
      >
        Done
      </button>
    </div>
  </div>
</div>

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
    max-width: 400px;
  }

  .content {
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0 0 1rem 0;
    font-size: 1.2rem;
    text-align: center;
  }

  .qr-container {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .qr-container img {
    max-width: 200px;
    height: auto;
  }

  .invoice-container {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin: 1rem 0;
  }

  .invoice-text {
    flex: 1;
    max-height: 80px;
    overflow-y: auto;
  }

  .invoice {
    font-size: 0.8rem;
    word-break: break-all;
    margin: 0;
    color: #666;
    font-family: monospace;
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
  }

  .page-info {
    font-size: 0.9rem;
    color: #666;
  }

  .actions {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .nav-button {
    background: none;
    border: 1px solid #ddd;
  }

  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .done {
    background: #ffd700;
    border: none;
    color: black;
    min-width: 100px;
  }

  .copy-button {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    min-width: 32px;
    height: 32px;
  }

  .copy-button:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #333;
  }

  .copy-button .material-icons {
    font-size: 20px;
  }

  @media (prefers-color-scheme: dark) {
    .popup {
      background: #2d2d2d;
      color: #fff;
    }

    .invoice {
      color: #ccc;
    }

    .page-info {
      color: #ccc;
    }

    .nav-button {
      border-color: #444;
      color: #fff;
    }

    .copy-button {
      color: #999;
    }

    .copy-button:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
  }
</style> 