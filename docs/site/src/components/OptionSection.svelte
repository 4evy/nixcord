<script lang="ts">
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import { disclosureIconClass, focusClass } from '../classes';
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
</script>

<details
  id={section.id}
  class="group/section border-t border-line first:border-t-0"
  {open}
  ontoggle={(event) => {
    // Ignore queued events from removed categories and controlled updates
    if (event.currentTarget.isConnected && event.currentTarget.open !== open) {
      onToggle(event.currentTarget.open);
    }
  }}
>
  <summary
    class={`grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-sm py-4 text-ink hover:bg-panel @max-[19rem]:grid-cols-1 [&::-webkit-details-marker]:hidden ${focusClass}`}
  >
    <h3 class="m-0 flex min-w-0 items-start gap-2 text-[17px]/snug font-semibold">
      <ChevronRight
        size={16}
        class={`${disclosureIconClass} group-open/section:rotate-90`}
        aria-hidden="true"
      />
      <span class="min-w-0">
        <span class="block">
          {section.title}
        </span>
        <span class="mt-1 block text-[13px]/[1.5] font-normal text-muted"
          >{section.description}</span
        >
      </span>
    </h3>
    <data
      class="pt-0.5 text-right text-xs/5 text-muted tabular-nums @max-[19rem]:ml-6 @max-[19rem]:justify-self-start"
      value={section.optionCount}
    >
      {countLabel}
    </data>
  </summary>

  {#if open}
    {#if section.optionCount === 0}
      <p
        class="my-4 rounded-r-sm border-l-4 border-neutral-300 bg-neutral-50 px-4 py-3 text-neutral-700 dark:border-neutral-600 dark:bg-[#171d24] dark:text-neutral-300"
      >
        No matching options in this category.
      </p>
    {:else}
      <ul class="m-0 list-none p-0">
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
