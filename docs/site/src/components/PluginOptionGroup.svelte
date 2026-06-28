<script lang="ts">
import { focusClass, optionCodeClass, termLinkClass } from '../classes';
import { getPluginOptionLabel } from '../options';
import type { PluginOptionGroup } from '../types';
import OptionDefinition from './OptionDefinition.svelte';

let { group }: { group: PluginOptionGroup } = $props();

const groupId = $derived(`opt-${group.name}`);
</script>

<details
  id={groupId}
  class="option-plugin group mt-5 scroll-mt-4 rounded-sm border border-neutral-300 border-l-4 border-l-[#0a3e68] bg-white shadow-sm target:!border-l-[#ec733b] target:bg-orange-50 target:shadow-md [contain-intrinsic-size:auto_520px] [content-visibility:auto]"
>
  <summary
    class={`option-plugin-summary flex min-h-12 cursor-pointer list-none items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3 transition-colors before:text-[1.05rem] before:leading-none before:text-[#0a3e68] before:transition-transform before:content-['›'] hover:bg-sky-50 hover:text-[#268598] group-open:before:rotate-90 max-sm:flex-wrap max-sm:items-start [&::-webkit-details-marker]:hidden ${focusClass}`}
  >
    <a class={termLinkClass} href={`#${groupId}`} aria-label={group.name}>
      <code class={`option ${optionCodeClass}`}>{group.name}</code>
    </a>
    <span class="option-plugin-count rounded-sm border border-neutral-200 bg-white px-2 py-0.5 text-[0.82rem] text-neutral-600 max-sm:mt-0.5">{group.optionCount} options</span>
  </summary>

  <dl class="variablelist option-plugin-options m-0 px-4 pb-4">
    {#each group.options as option (option.name)}
      <OptionDefinition {option} label={getPluginOptionLabel(group.name, option.name)} mutedBorder />
    {/each}
  </dl>
</details>
