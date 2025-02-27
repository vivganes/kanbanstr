import { writable } from 'svelte/store';

// Simple browser check
const isBrowser = typeof window !== 'undefined';

interface DonationState {
  showPopup: boolean;
  lastIgnored: number | null;
}

function createDonationStore() {
  const { subscribe, set, update } = writable<DonationState>({
    showPopup: false,
    lastIgnored: isBrowser ? Number(localStorage.getItem('lastDonationIgnoredOrDone')) : null
  });

  return {
    subscribe,
    showDonationRequest: () => {
      const lastIgnored = isBrowser ? Number(localStorage.getItem('lastDonationIgnoredOrDone')) : null;
      const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
      
      if (!lastIgnored || lastIgnored < twoWeeksAgo) {
        update(state => ({ ...state, showPopup: true }));
      }
    },
    ignoreDonation: () => {
      const timestamp = Date.now();
      if (isBrowser) {
        localStorage.setItem('lastDonationIgnoredOrDone', timestamp.toString());
      }
      update(state => ({ ...state, showPopup: false, lastIgnored: timestamp }));
    },
    hidePopup: () => {
      update(state => ({ ...state, showPopup: false }));
    }
  };
}

export const donationStore = createDonationStore(); 