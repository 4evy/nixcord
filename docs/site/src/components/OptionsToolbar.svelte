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

<search aria-label="Configuration options" class="options-toolbar">
  <label for="option-search" class="search-label">Search configuration options</label>
  <div class="option-search-field">
    <Search size={18} class="search-icon" aria-hidden="true" />
    <input
      id="option-search"
      type="search"
      placeholder="Name, description, or type"
      autocomplete="off"
      bind:value={query}
    />
    {#if hasQuery}
      <button
        type="button"
        class={`clear-search ${focusClass}`}
        aria-label="Clear option search"
        title="Clear search"
        onclick={() => (query = '')}
      >
        <X size={16} aria-hidden="true" />
      </button>
    {/if}
  </div>

  <div class="option-filter-row">
    <fieldset class="option-categories">
      <legend class="sr-only">Category</legend>
      <div class="category-choices">
        {#each categories as item (item.value)}
          <span class="category-choice">
            <input
              id={`options-category-${item.value}`}
              class="sr-only"
              type="radio"
              name="options-category"
              value={item.value}
              bind:group={category}
            />
            <label for={`options-category-${item.value}`}>
              {item.label}
            </label>
          </span>
        {/each}
      </div>
    </fieldset>
    <p class="option-result-count" role="status" aria-live="polite">{statusText}</p>
  </div>
</search>
