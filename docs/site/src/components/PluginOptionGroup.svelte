<script lang="ts">
import { focusClass, optionCodeClass } from '../classes';
import { getPluginOptionLabel } from '../options';
import type { PluginOptionGroup } from '../types';
import OptionDefinition from './OptionDefinition.svelte';

let { group }: { group: PluginOptionGroup } = $props();

const groupId = $derived(`opt-${group.name}`);
const groupHeadingId = $derived(`${groupId}-heading`);
</script>

<li class="option-plugin-item my-0">
  <details
    id={groupId}
    class="option-plugin group mt-5 scroll-mt-4 rounded-sm border border-neutral-300 border-l-4 border-l-[#0a3e68] bg-white shadow-sm target:!border-l-[#ec733b] target:bg-orange-50 target:shadow-md [contain-intrinsic-size:auto_520px] [content-visibility:auto] dark:border-neutral-700 dark:border-l-[#8ccff0] dark:bg-[#12171d] dark:target:bg-[#2a1d18]"
  >
    <summary
      class={`option-plugin-summary flex min-h-12 cursor-pointer list-none items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 transition-colors before:text-[1.05rem] before:leading-none before:text-[#0a3e68] before:transition-transform before:content-['›'] hover:bg-sky-50 hover:text-[#268598] group-open:before:rotate-90 max-sm:flex-wrap max-sm:items-start [&::-webkit-details-marker]:hidden dark:border-neutral-700 dark:bg-[#171d24] dark:text-[#8ccff0] dark:before:text-[#8ccff0] dark:hover:bg-[#1f2b35] dark:hover:text-[#bde8fa] ${focusClass}`}
    >
      <h4 id={groupHeadingId} class="my-0 text-[1rem] leading-snug font-semibold">
        <code class={`option ${optionCodeClass}`}>{group.name}</code>
      </h4>
      <data
        class="option-plugin-count rounded-sm border border-neutral-200 bg-white px-2 py-0.5 text-[0.82rem] text-neutral-600 max-sm:mt-0.5 dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-400"
        value={group.optionCount}
      >
        {group.optionCount} options
      </data>
    </summary>

    <ul class="option-plugin-options m-0 list-none px-4 pb-4">
      {#each group.options as option (option.name)}
        <OptionDefinition
          {option}
          headingLevel={5}
          label={getPluginOptionLabel(group.name, option.name)}
          mutedBorder
        />
      {/each}
    </ul>
  </details>
</li>
