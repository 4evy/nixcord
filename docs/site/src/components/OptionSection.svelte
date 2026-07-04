<script lang="ts">
import { focusClass } from '../classes';
import type { OptionSection } from '../types';
import OptionDefinition from './OptionDefinition.svelte';
import PluginOptionGroup from './PluginOptionGroup.svelte';

let { section, open = false }: { section: OptionSection; open?: boolean } = $props();
</script>

<details
  id={section.id}
  class="option-section group scroll-mt-4 border-t border-neutral-300 py-3 [contain-intrinsic-size:auto_1600px] [content-visibility:auto] first:border-t-0 first:pt-0 dark:border-neutral-700"
  {open}
>
  <summary
    class={`option-section-summary -mx-2 flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-sm px-2 py-2 text-[#0a3e68] transition-colors before:text-[1.05rem] before:leading-none before:text-[#0a3e68] before:transition-transform before:content-['›'] hover:bg-sky-50 hover:text-[#268598] group-open:before:rotate-90 max-sm:flex-wrap max-sm:items-start [&::-webkit-details-marker]:hidden dark:text-[#8ccff0] dark:before:text-[#8ccff0] dark:hover:bg-[#1f2b35] dark:hover:text-[#bde8fa] ${focusClass}`}
  >
    <h3 class="option-section-heading my-0 inline text-[1.35rem] leading-snug font-semibold">{section.title}</h3>
    <data
      class="option-section-count rounded-sm border border-neutral-200 bg-white px-2 py-0.5 text-[0.85rem] text-neutral-600 max-sm:mt-0.5 dark:border-neutral-700 dark:bg-[#171d24] dark:text-neutral-400"
      value={section.optionCount}
    >
      {section.optionCount} options
    </data>
  </summary>

  <p class="mt-2 mb-0 max-w-[72ch] text-neutral-700 dark:text-neutral-300">{section.description}</p>

  <ul class="option-section-items m-0 list-none p-0">
    {#each section.items as item (item.kind === 'plugin' ? item.group.name : item.option.name)}
      {#if item.kind === 'plugin'}
        <PluginOptionGroup group={item.group} />
      {:else}
        <OptionDefinition option={item.option} />
      {/if}
    {/each}
  </ul>
</details>
