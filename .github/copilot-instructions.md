## Quick repo orientation ✅

- Stack: Svelte (v5) + TypeScript + Vite. Nostr integration is via @nostr-dev-kit/ndk and @nostr-dev-kit/ndk-wallet.
- Purpose: a decentralized kanban board where Boards (kind 30301) and Cards (kind 30302) are stored as Nostr events (see `NIP-100.md`).

## How to run (local dev) 🔧

- Install: `npm i`
- Dev server: `npm run dev` (Vite) — app served from `index.html`/`#/` routes
- Build: `npm run build`; Preview: `npm run preview`
- Type/TS checks: `npm run check` (runs `svelte-check` + `tsc`)

## High-level architecture & patterns 💡

- ndkInstance centralizes Nostr access: see `src/lib/ndk/index.ts`. It manages login (nsec/npub/nip07/readonly), relays, and zaps.
- The application UI is Svelte components under `src/lib/components/` and application state is in Svelte stores under `src/lib/stores/` (notably `kanbanStore`).
- `kanbanStore` encapsulates board/card logic & data flows (fetching with filters, deduping by `d` tags, creating/publishing events). See `src/lib/stores/kanban.ts` for canonical patterns.

## Event kinds, canonical tags & examples (use these exactly) 🔗

- Board event: kind = **30301**. Tags: `['d', <board-id>]`, `['title', ...]`, `['col', id, name, order]`, `['p', <maintainer-pubkey>]`, optional `['nozap']`.
- Card event: kind = **30302**. Tags: `['d', <card-id>]`, `['a', '30301:<board-pubkey>:<board-d>']` (board ref), `['title', ...]`, `['description', ...]`, `['s', status]`, `['rank', order]`, `['u', <attachment-url>]`, `['p'|'zap', <assignee-pubkey>]`, `['i', 'kanban:<boardPub>:<boardD>:<cardD>', forwardLabel, backwardLabel]`.
- Tracker cards use `['k', '<kind>']` and NIP-34 style `refs/*` tags (see `NIP-100.md` and `old-NIP-100.md`).
- Use `publishReplaceable()` for replacing an existing `d`-tagged resource (the repo uses `publishReplaceable` for updates).

## Data flows & UI integration notes 🧭

- Stores are initialized when the NDK instance becomes ready (see `BoardsList.svelte` & `BoardView.svelte` where `kanbanStore.init(ndkInstance.ndk!)` is called).
- Fetching uses `ndk.fetchEvents({ kinds: [...], '#d'|'#a'|'#i': [...] })`. Deduping is done by taking the latest event per `d` tag (see `dedupeEventsBasedOnDTag`).
- Card ordering uses a numeric `rank` tag; ordering recalculation places new cards between neighbors (see `calculateNewOrder`).

## Migration & compatibility ⚠️

- The app supports legacy boards with embedded `content.columns` and `a` tag references; migration logic lives in `src/lib/utils/MigrationUtilV1.ts`. If you change board/card format, update `NIP-100.md` and `MigrationUtilV1`.

## Wallets & zaps 💳

- Wallets and zapping are handled by `ndkInstance`. Login methods: `nsec`, `npub`, `nip07`, `readonly`.
- Zap flow: `ndkInstance.zapCard/cardProfile` and `ndkInstance.initializeWalletForZapping()`; zap amounts are read from 9735 events and aggregated by `ndkInstance.getZapAmount`.

## Useful files to inspect first 📁

- `NIP-100.md` — canonical event spec for this project (must match code)
- `src/lib/stores/kanban.ts` — all board/card logic and tag conventions
- `src/lib/ndk/index.ts` — login, relays, wallet, zap helpers
- `src/lib/utils/MigrationUtilV1.ts` — migration strategy for legacy boards
- `src/lib/components/` — UI that calls store methods (how stores are used)

## Conventions & quick tips ✅

- Prefer tags over content for structured data (the app expects tags like `col`, `d`, `a` etc.).
- Use `publishReplaceable()` for updates to resources identified by `d` tags so old versions are replaced automatically on relays.
- After publishing board/card changes some UI flows trigger `donationStore.showDonationRequest()` — be mindful when adding new publishing flows.
- If you modify the event schema, update `NIP-100.md` and add migration logic; tests are manual at present (no CI tests in repo).

