<script lang="ts">
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
  { label: 'Core', value: 'core' },
  { label: 'Shared', value: 'shared' },
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

<div
  class="options-toolbar my-5 rounded-md border border-neutral-300 bg-neutral-50 p-4 shadow-sm dark:border-neutral-700 dark:bg-[#171d24]"
>
  <div class="flex items-end gap-3 max-sm:items-stretch">
    <label class="min-w-0 flex-1">
      <span class="mb-2 block text-[0.9rem] font-semibold text-neutral-700 dark:text-neutral-300">
        Search configuration options
      </span>
      <span class="relative block">
        <svg
          class="pointer-events-none absolute top-1/2 left-3 h-4.5 w-4.5 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" />
        </svg>
        <input
          class={`h-11 w-full rounded-sm border border-neutral-300 bg-white pr-10 pl-10 text-[0.95rem] text-neutral-950 shadow-sm outline-none placeholder:text-neutral-500 focus:border-[#167cb9] focus:ring-3 focus:ring-[#167cb9]/20 dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-100 dark:placeholder:text-neutral-400 ${focusClass}`}
          type="search"
          placeholder="Name, description, or type"
          autocomplete="off"
          bind:value={query}
        />
        {#if hasQuery}
          <button
            type="button"
            class={`absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-[#1f2b35] dark:hover:text-neutral-100 ${focusClass}`}
            aria-label="Clear option search"
            title="Clear search"
            onclick={() => (query = '')}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" />
            </svg>
          </button>
        {/if}
      </span>
    </label>
  </div>

  <fieldset class="mt-4">
    <legend class="mb-2 text-[0.85rem] font-semibold text-neutral-600 dark:text-neutral-400">
      Category
    </legend>
    <div class="flex flex-wrap gap-2">
      {#each categories as item (item.value)}
        <span class="relative">
          <input
            id={`options-category-${item.value}`}
            class="peer sr-only"
            type="radio"
            name="options-category"
            value={item.value}
            bind:group={category}
          />
          <label
            for={`options-category-${item.value}`}
            class={`inline-flex cursor-pointer rounded-full border px-3 py-1.5 text-[0.85rem] font-medium transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-[#f6cf5e] ${
              category === item.value
                ? 'border-[#0a3e68] bg-[#0a3e68] text-white dark:border-[#8ccff0] dark:bg-[#8ccff0] dark:text-[#0f1318]'
                : 'border-neutral-300 bg-white text-neutral-700 hover:border-[#167cb9] hover:text-[#0a3e68] dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-300 dark:hover:border-[#8ccff0] dark:hover:text-[#bde8fa]'
            }`}
          >
            {item.label}
          </label>
        </span>
      {/each}
    </div>
  </fieldset>

  <p class="mt-3 mb-0 text-[0.85rem] text-neutral-600 dark:text-neutral-400" role="status" aria-live="polite">
    {statusText}
  </p>
</div>
