<script lang="ts">
import Search from '@lucide/svelte/icons/search';
import X from '@lucide/svelte/icons/x';
import { focusClass } from '../classes';
import type { OptionCategoryFilter } from '../types';

let {
  category = $bindable(),
  query = $bindable(),
  totalMatches,
  totalOptions,
}: {
  category: OptionCategoryFilter;
  query: string;
  totalMatches: number;
  totalOptions: number;
} = $props();

const categories: { label: string; value: OptionCategoryFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Clients & config', value: 'core' },
  { label: 'Shared plugins', value: 'shared' },
  { label: 'Vencord', value: 'vencord' },
  { label: 'Equicord', value: 'equicord' },
];

const hasQuery = $derived(query.trim().length > 0);
const statusText = $derived(
  hasQuery
    ? `${totalMatches} of ${totalOptions} options match your search`
    : category === 'all'
      ? `${totalOptions} options available`
      : `${totalMatches} options in this category`
);
</script>

<search aria-label="Configuration options" class="mt-5 mb-2">
  <label for="option-search" class="mb-2 block text-[13px] font-semibold"
    >Search configuration options</label
  >
  <div class="relative">
    <Search
      size={18}
      class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
      aria-hidden="true"
    />
    <input
      class="h-11 w-full rounded-md border border-line bg-page px-11 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-search-cancel-button]:appearance-none"
      id="option-search"
      type="search"
      placeholder="Search by name, description, or type…"
      autocomplete="off"
      bind:value={query}
    >
    {#if hasQuery}
      <button
        type="button"
        class={`absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded text-muted hover:bg-panel hover:text-ink ${focusClass}`}
        aria-label="Clear option search"
        title="Clear search"
        onclick={() => (query = '')}
      >
        <X size={16} aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if !hasQuery}
    <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>Try</span>
      {#each ['hideMedia', 'themeLinks', 'vesktop'] as example}
        <button
          class={`min-h-9 cursor-pointer font-mono text-accent underline-offset-3 hover:underline ${focusClass}`}
          type="button"
          aria-label={`Search for ${example}`}
          onclick={() => (query = example)}
        >
          {example}
        </button>
      {/each}
    </div>
  {/if}

  <div class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <fieldset class="min-w-0">
      <legend class="sr-only">Category</legend>
      <div class="flex flex-wrap gap-1">
        {#each categories as item (item.value)}
          <span class="relative">
            <input
              id={`options-category-${item.value}`}
              class="peer sr-only"
              type="radio"
              name="options-category"
              value={item.value}
              bind:group={category}
            >
            <label
              class="inline-flex min-h-11 cursor-pointer items-center rounded px-2.5 py-1 text-[13px] text-muted hover:bg-panel hover:text-ink peer-checked:bg-selected peer-checked:font-semibold peer-checked:text-accent peer-checked:inset-shadow-[0_-2px_var(--color-accent)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
              for={`options-category-${item.value}`}
            >
              {item.label}
            </label>
          </span>
        {/each}
      </div>
    </fieldset>
    <p class="text-xs text-muted tabular-nums" role="status" aria-live="polite">{statusText}</p>
  </div>
</search>
