<script lang="ts">
import { focusClass, optionCodeClass } from '../classes';
import { getPluginOptionLabel } from '../options';
import type { PluginOptionGroup } from '../types';
import OptionDefinition from './OptionDefinition.svelte';

let {
  filtering = false,
  group,
  onOptionToggle,
  onToggle,
  open = false,
  openOptionNames,
}: {
  filtering?: boolean;
  group: PluginOptionGroup;
  onOptionToggle: (optionName: string, open: boolean) => void;
  onToggle: (open: boolean) => void;
  open?: boolean;
  openOptionNames: Set<string>;
} = $props();

const groupId = $derived(`opt-${group.name}`);
const groupHeadingId = $derived(`${groupId}-heading`);
const countLabel = $derived(
  filtering && group.optionCount !== group.totalOptionCount
    ? `${group.optionCount} of ${group.totalOptionCount} options`
    : `${group.totalOptionCount} options`
);

function handleSummaryKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onToggle(!open);
}
</script>

<li class="option-plugin-item my-0">
  <details
    id={groupId}
    class="option-plugin mt-3 scroll-mt-20 rounded-sm border border-neutral-300 border-l-4 border-l-[#0a3e68] bg-white shadow-sm target:!border-l-[#ec733b] target:bg-orange-50 target:shadow-md dark:border-neutral-700 dark:border-l-[#8ccff0] dark:bg-[#12171d] dark:target:bg-[#2a1d18]"
    {open}
    ontoggle={(event) => onToggle(event.currentTarget.open)}
  >
    <summary
      class={`option-plugin-summary grid min-h-14 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-sm bg-neutral-50 px-4 py-3 transition-colors hover:bg-sky-50 [&::-webkit-details-marker]:hidden dark:bg-[#171d24] dark:hover:bg-[#1f2b35] ${
        open ? 'rounded-b-none border-b border-neutral-200 dark:border-neutral-700' : ''
      } ${focusClass}`}
      onkeydown={handleSummaryKeydown}
    >
      <span class="flex min-w-0 items-start gap-2">
        <span
          class={`mt-0.5 shrink-0 text-[1.05rem] leading-none text-[#0a3e68] transition-transform dark:text-[#8ccff0] ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >›</span>
        <h4 id={groupHeadingId} class="my-0 min-w-0 text-[1rem] leading-snug font-semibold">
          <code class={`option ${optionCodeClass}`}>{group.name}</code>
        </h4>
      </span>
      <data
        class="rounded-sm border border-neutral-200 bg-white px-2 py-0.5 text-right text-[0.8rem] leading-5 text-neutral-600 dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-400"
        value={group.optionCount}
      >
        {countLabel}
      </data>
    </summary>

    {#if open}
      <ul class="option-plugin-options m-0 list-none px-4 pb-4">
        {#each group.options as option (option.name)}
          <OptionDefinition
            {option}
            headingLevel={5}
            label={getPluginOptionLabel(group.name, option.name)}
            mutedBorder
            open={openOptionNames.has(option.name)}
            onToggle={(isOpen) => onOptionToggle(option.name, isOpen)}
          />
        {/each}
      </ul>
    {/if}
  </details>
</li>
