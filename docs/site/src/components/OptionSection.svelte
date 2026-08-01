<script lang="ts">
import { focusClass } from '../classes';
import type { OptionSection } from '../types';
import OptionDefinition from './OptionDefinition.svelte';
import PluginOptionGroup from './PluginOptionGroup.svelte';

let {
  filtering = false,
  onOptionToggle,
  onPluginToggle,
  onToggle,
  open = false,
  openOptionNames,
  openPluginNames,
  section,
}: {
  filtering?: boolean;
  onOptionToggle: (optionName: string, open: boolean) => void;
  onPluginToggle: (pluginName: string, open: boolean) => void;
  onToggle: (open: boolean) => void;
  open?: boolean;
  openOptionNames: Set<string>;
  openPluginNames: Set<string>;
  section: OptionSection;
} = $props();

const countLabel = $derived(
  filtering && section.optionCount !== section.totalOptionCount
    ? `${section.optionCount} of ${section.totalOptionCount} options`
    : `${section.totalOptionCount} options`
);

function handleSummaryKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onToggle(!open);
}
</script>

<details
  id={section.id}
  class="option-section scroll-mt-20 border-t border-neutral-300 py-3 first:border-t-0 first:pt-0 dark:border-neutral-700"
  {open}
  ontoggle={(event) => onToggle(event.currentTarget.open)}
>
  <summary
    class={`option-section-summary -mx-2 grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-sm px-2 py-2 text-[#0a3e68] transition-colors hover:bg-sky-50 hover:text-[#268598] [&::-webkit-details-marker]:hidden dark:text-[#8ccff0] dark:hover:bg-[#1f2b35] dark:hover:text-[#bde8fa] ${focusClass}`}
    onkeydown={handleSummaryKeydown}
  >
    <span class="flex min-w-0 items-start gap-2">
      <span
        class={`mt-0.5 shrink-0 text-[1.05rem] leading-none text-[#0a3e68] transition-transform dark:text-[#8ccff0] ${open ? 'rotate-90' : ''}`}
        aria-hidden="true"
      >›</span>
      <h3 class="option-section-heading my-0 min-w-0 text-[1.35rem] leading-snug font-semibold">
        {section.title}
      </h3>
    </span>
    <data
      class="rounded-sm border border-neutral-200 bg-white px-2 py-0.5 text-right text-[0.82rem] leading-5 text-neutral-600 dark:border-neutral-700 dark:bg-[#171d24] dark:text-neutral-400"
      value={section.optionCount}
    >
      {countLabel}
    </data>
  </summary>

  {#if open}
    <p class="mt-2 mb-0 max-w-[72ch] text-neutral-700 dark:text-neutral-300">{section.description}</p>

    {#if section.optionCount === 0}
      <p class="my-4 rounded-r-sm border-l-4 border-neutral-300 bg-neutral-50 px-4 py-3 text-neutral-700 dark:border-neutral-600 dark:bg-[#171d24] dark:text-neutral-300">
        No matching options in this category.
      </p>
    {:else}
      <ul class="option-section-items m-0 list-none p-0">
        {#each section.items as item (item.kind === 'plugin' ? item.group.name : item.option.name)}
          {#if item.kind === 'plugin'}
            <PluginOptionGroup
              group={item.group}
              {filtering}
              open={openPluginNames.has(item.group.name)}
              {openOptionNames}
              onToggle={(isOpen) => onPluginToggle(item.group.name, isOpen)}
              {onOptionToggle}
            />
          {:else}
            <OptionDefinition
              option={item.option}
              open={openOptionNames.has(item.option.name)}
              onToggle={(isOpen) => onOptionToggle(item.option.name, isOpen)}
            />
          {/if}
        {/each}
      </ul>
    {/if}
  {/if}
</details>
