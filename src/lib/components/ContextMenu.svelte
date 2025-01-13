<script lang="ts">
  import { createEventDispatcher } from 'svelte'; 
  import { activeContextMenuId } from '../stores/contextMenu';
  const dispatch = createEventDispatcher();

  export let id: string;
  export let visible: boolean = false;
  export let position: { x: number; y: number } = { x: 0, y: 0 };
  export let items: Array<{ 
    label: string; 
    icon: string; 
    action: string;
    success?: boolean;
  }> = [];

  let localItems = [...items];

  $: localItems = [...items];

  const handleClickOutside = (event: MouseEvent) => {
    if (!event.target || !event.target.closest('.context-menu')) {
      closeMenu();
    }
  };

  export function closeMenu() {
    visible = false;
    activeContextMenuId.set(null);
    localItems = localItems.map(item => ({ ...item, success: false }));
    dispatch('close');
  }

  function handleItemClick(event: MouseEvent, action: string) {
    event.preventDefault();
    event.stopPropagation();
    dispatch('select', action);
  }

  function openMenu() {
    activeContextMenuId.set(id);
  }

  $: if (visible) {
    openMenu();
  }

  import { onMount, onDestroy } from 'svelte';
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
    if ($activeContextMenuId === id) {
      activeContextMenuId.set(null);
    }
  });

  export function setItemSuccess(action: string) {
    localItems = localItems.map(item => 
      item.action === action 
        ? { ...item, success: true } 
        : item
    );
  }
</script>

{#if visible && $activeContextMenuId === id}
  <div
    class="context-menu"
    style="top: {position.y}px; left: {position.x}px;"
    on:click|stopPropagation
  >
    {#each localItems as { label, icon, action, success }}
      <div
        class="context-menu-item"
        class:success={success}
        on:click|preventDefault|stopPropagation={(e) => handleItemClick(e, action)}
      >
        <span class="material-icons icon" style="vertical-align: middle; margin-right: 8px;">
          {success ? 'check_circle' : icon}
        </span>
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

  .context-menu-item.success {
    color: #2ecc71;
  }

  .context-menu-item.success .icon {
    color: #2ecc71;
  }
</style>
