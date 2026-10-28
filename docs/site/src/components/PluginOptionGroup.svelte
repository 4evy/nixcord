<script lang="ts">
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import { disclosureIconClass, focusClass } from '../classes';
import { getPluginOptionLabel } from '../options';
import type { PluginOptionGroup } from '../types';
import OptionDefinition from './OptionDefinition.svelte';
import OptionName from './OptionName.svelte';

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
    : `${group.totalOptionCount} ${group.totalOptionCount === 1 ? 'option' : 'options'}`
);
</script>

<li class="my-0">
  <details
    id={groupId}
    class="group/plugin border-b border-line target:bg-selected target:inset-shadow-[2px_0_var(--color-accent)]"
    {open}
    ontoggle={(event) => {
      if (event.currentTarget.isConnected && event.currentTarget.open !== open) {
        onToggle(event.currentTarget.open);
      }
    }}
  >
    <summary
      class={`grid min-h-14 cursor-pointer list-none grid-cols-1 items-start gap-1 rounded-sm py-3.5 hover:bg-panel @min-[40rem]:grid-cols-[minmax(0,1fr)_auto] @min-[40rem]:gap-3 [&::-webkit-details-marker]:hidden ${focusClass}`}
    >
      <h4
        id={groupHeadingId}
        class="m-0 flex min-w-0 items-start gap-2 text-[13px]/snug font-medium"
      >
        <ChevronRight
          size={16}
          class={`${disclosureIconClass} group-open/plugin:rotate-90`}
          aria-hidden="true"
        />

        <OptionName name={group.name} />
      </h4>
      <data
        class="ml-6 text-xs/5 text-muted tabular-nums @min-[40rem]:ml-0 @min-[40rem]:text-right"
        value={group.optionCount}
      >
        {countLabel}
      </data>
    </summary>

    {#if open}
      <ul class="ml-2 list-none border-l border-line pl-2.5 @min-[40rem]:ml-4 @min-[40rem]:pl-6">
        {#each group.options as option (option.name)}
          <OptionDefinition
            {option}
            label={getPluginOptionLabel(group.name, option.name)}
            open={openOptionNames.has(option.name)}
            onToggle={(isOpen) => onOptionToggle(option.name, isOpen)}
          />
        {/each}
      </ul>
    {/if}
  </details>
</li>
