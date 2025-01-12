<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let visible: boolean = false;
  export let position: { x: number; y: number } = { x: 0, y: 0 };
  export let items: Array<{ label: string; icon:string; action: string }> = [];

  let staticActiveMenu: string | null = null;

  const handleClickOutside = (event: MouseEvent) => {
    if (!event.target || !event.target.closest('.context-menu')) {
      closeMenu();
    }
  };

  $: if (visible) {
    openMenu(`contextMenu_${Math.random()}`);
  }


  function closeMenu() {
    staticActiveMenu = null;
    dispatch('close');
  }

  function openMenu(cardId: string) {
    if (staticActiveMenu && staticActiveMenu !== cardId) {
      staticActiveMenu = null;
    }

    staticActiveMenu = cardId;
  }

  import { onMount, onDestroy } from 'svelte';
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  function handleItemClick(action: string) {
    console.log("action - "+action)
    dispatch('select', action);
    closeMenu();
  }
</script>

{#if visible}
  <div
    class="context-menu"
    style="top: {position.y}px; left: {position.x}px;"
  >
    {#each items as { label, icon, action }}
      <div
        class="context-menu-item"
        on:click={() => handleItemClick(action)}
      >
       <span class="material-icons icon" style="vertical-align: middle; margin-right: 8px;">{icon}</span>
        {label}
      </div>
    {/each}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 9999;
    padding: 5px 0;
  }

  .context-menu-item {
    padding: 6px 8px;
    cursor: pointer;
    white-space: nowrap;
    font-size: 0.8rem;
  }

  .context-menu-item:hover {
    background-color: #f0f0f0;
  }

  .material-icons.icon {
    font-size: 0.9rem;
  }
</style>
