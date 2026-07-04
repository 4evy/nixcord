<script lang="ts">
import { mode, toggleMode } from 'mode-watcher';
import { focusClass } from '../classes';

const nextMode = $derived(mode.current === 'dark' ? 'light' : 'dark');
const label = $derived(`Switch to ${nextMode} mode`);
</script>

<button
  type="button"
  class={`inline-flex h-9 w-9 items-center justify-center rounded-sm border border-neutral-300 bg-white text-[#0a3e68] shadow-sm transition-colors hover:bg-sky-50 hover:text-[#268598] dark:border-neutral-700 dark:bg-[#171d24] dark:text-[#8ccff0] dark:hover:bg-[#1f2b35] dark:hover:text-[#bde8fa] ${focusClass}`}
  aria-label={label}
  title={label}
  onclick={toggleMode}
>
  {#if mode.current === 'dark'}
    <svg class="h-4.5 w-4.5" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2" />
      <path
        d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="2"
      />
    </svg>
  {:else}
    <svg class="h-4.5 w-4.5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5 14.4A7.6 7.6 0 0 1 9.6 3.5 8.9 8.9 0 1 0 20.5 14.4Z"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
      />
    </svg>
  {/if}
</button>
