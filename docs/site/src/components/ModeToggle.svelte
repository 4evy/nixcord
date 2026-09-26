<script lang="ts">
import Sun from '@lucide/svelte/icons/sun';
import Moon from '@lucide/svelte/icons/moon';
import { mode, toggleMode } from 'mode-watcher';
import { focusClass } from '../classes';

const nextMode = $derived(mode.current === 'dark' ? 'light' : 'dark');
const label = $derived(`Switch to ${nextMode} mode`);
</script>

<button
  type="button"
  class={`theme-toggle ${focusClass}`}
  aria-label={label}
  title={label}
  onclick={toggleMode}
>
  {#if mode.current === 'dark'}
    <Sun size={18} aria-hidden="true" />
  {:else}
    <Moon size={18} aria-hidden="true" />
  {/if}
</button>
