<script lang="ts">
import Link from '@lucide/svelte/icons/link';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import {
  disclosureIconClass,
  filenameCodeClass,
  focusClass,
  linkClass,
  literalCodeClass,
  paragraphClass,
} from '../classes';
import { stringifyDocValue } from '../options';
import type { OptionEntry } from '../types';
import OptionName from './OptionName.svelte';

let {
  option,
  label = option.name,
  onToggle,
  open = false,
}: {
  label?: string;
  onToggle: (open: boolean) => void;
  open?: boolean;
  option: OptionEntry;
} = $props();

const optionId = $derived(`opt-${option.name}`);
</script>

<li class="my-0">
  <details
    id={optionId}
    class="group/option @container/option border-b border-line target:bg-selected target:inset-shadow-[2px_0_var(--color-accent)]"
    {open}
    ontoggle={(event) => {
      if (event.currentTarget.isConnected && event.currentTarget.open !== open) {
        onToggle(event.currentTarget.open);
      }
    }}
  >
    <summary
      class={`grid min-h-16 cursor-pointer list-none grid-cols-1 items-start gap-x-3 gap-y-1 rounded-sm py-3.5 hover:bg-panel @min-[40rem]:grid-cols-[minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden ${focusClass}`}
    >
      <span class="flex min-w-0 items-start gap-2">
        <ChevronRight
          size={16}
          class={`${disclosureIconClass} group-open/option:rotate-90`}
          aria-hidden="true"
        />
        <span class="min-w-0">
          <span class="block text-[13px]/snug font-medium">
            <OptionName name={label} />
          </span>
          <span class="mt-1 line-clamp-2 text-[13px]/5 text-muted wrap-anywhere">
            {stringifyDocValue(option.description)}
          </span>
        </span>
      </span>

      {#if option.type}
        <span
          class="ml-6 max-w-full justify-self-start rounded bg-panel px-2 py-0.5 text-[11px]/5 text-muted wrap-anywhere @min-[40rem]:ml-0 @min-[40rem]:max-w-40 @min-[40rem]:justify-self-end @min-[40rem]:text-right"
        >
          {option.type}
        </span>
      {/if}
    </summary>

    <div class="pt-1 pb-4 pl-6 text-sm">
      <p class={paragraphClass}>
        {stringifyDocValue(option.description)}
      </p>

      <dl class="mb-3 border-t border-line">
        {#if option.type}
          <div
            class="grid gap-1 border-b border-line py-2.5 last:border-b-0 @min-[28rem]/option:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <dt class="text-[0.9rem] font-semibold text-muted">Type</dt>
            <dd class="m-0 min-w-0">{option.type}</dd>
          </div>
        {/if}

        {#if option.default != null}
          <div
            class="grid gap-1 border-b border-line py-2.5 last:border-b-0 @min-[28rem]/option:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <dt class="text-[0.9rem] font-semibold text-muted">Default</dt>
            <dd class="m-0 min-w-0">
              <code class={literalCodeClass}>{stringifyDocValue(option.default)}</code>
            </dd>
          </div>
        {/if}

        {#if option.example != null}
          <div
            class="grid gap-1 border-b border-line py-2.5 last:border-b-0 @min-[28rem]/option:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <dt class="text-[0.9rem] font-semibold text-muted">Example</dt>
            <dd class="m-0 min-w-0">
              <code class={literalCodeClass}>{stringifyDocValue(option.example)}</code>
            </dd>
          </div>
        {/if}

        {#if option.declarations?.length}
          <div
            class="grid gap-1 border-b border-line py-2.5 last:border-b-0 @min-[28rem]/option:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <dt class="text-[0.9rem] font-semibold text-muted">Declared by</dt>
            <dd class="m-0 min-w-0">
              <ul class="m-0 list-none p-0">
                {#each option.declarations as declaration, index (`${option.name}-${index}`)}
                  <li class="my-0 mt-1 first:mt-0">
                    <code class={`${filenameCodeClass}`}>
                      <a class={linkClass} href={declaration.url}>{declaration.name}</a>
                    </code>
                  </li>
                {/each}
              </ul>
            </dd>
          </div>
        {/if}
      </dl>

      <a class={`inline-flex min-h-9 items-center text-sm ${linkClass}`} href={`#${optionId}`}>
        <Link size={14} class="mr-2" aria-hidden="true" />
        Link to this option
      </a>
    </div>
  </details>
</li>
