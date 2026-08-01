<script lang="ts">
import {
  filenameCodeClass,
  focusClass,
  literalCodeClass,
  optionCodeClass,
  paragraphClass,
  termLinkClass,
} from '../classes';
import { stringifyDocValue } from '../options';
import type { OptionEntry } from '../types';

let {
  headingLevel = 4,
  label = option.name,
  mutedBorder = false,
  onToggle,
  open = false,
  option,
}: {
  headingLevel?: 4 | 5;
  label?: string;
  mutedBorder?: boolean;
  onToggle: (open: boolean) => void;
  open?: boolean;
  option: OptionEntry;
} = $props();

const optionId = $derived(`opt-${option.name}`);
const headingId = $derived(`${optionId}-heading`);
const headingTag = $derived(headingLevel === 4 ? 'h4' : 'h5');

function handleSummaryKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onToggle(!open);
}
</script>

<li class="option-item my-0">
  <details
    id={optionId}
    class={`option-definition mt-3 scroll-mt-20 rounded-sm border border-neutral-300 border-l-4 bg-white shadow-sm target:!border-l-[#ec733b] target:bg-orange-50 target:shadow-md dark:border-neutral-700 dark:bg-[#12171d] dark:target:bg-[#2a1d18] ${
      mutedBorder ? 'border-l-neutral-300 dark:border-l-neutral-600' : 'border-l-[#0a3e68] dark:border-l-[#8ccff0]'
    }`}
    {open}
    ontoggle={(event) => onToggle(event.currentTarget.open)}
  >
    <summary
      class={`option-heading grid min-h-16 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-sm bg-neutral-50 px-4 py-3 transition-colors hover:bg-sky-50 [&::-webkit-details-marker]:hidden dark:bg-[#171d24] dark:hover:bg-[#1f2b35] ${
        open ? 'rounded-b-none border-b border-neutral-200 dark:border-neutral-700' : ''
      } ${focusClass}`}
      onkeydown={handleSummaryKeydown}
    >
      <span class="flex min-w-0 items-start gap-2">
        <span
          class={`mt-0.5 shrink-0 text-[1.05rem] leading-none text-[#0a3e68] transition-transform dark:text-[#8ccff0] ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >›</span>
        <span class="min-w-0">
          <svelte:element this={headingTag} id={headingId} class="my-0 text-[1rem] leading-snug font-semibold">
            <code class={`option ${optionCodeClass}`}>{label}</code>
          </svelte:element>
          <span
            class="option-summary-description mt-1 overflow-hidden text-[0.88rem] leading-5 text-neutral-600 dark:text-neutral-400"
          >
            {stringifyDocValue(option.description)}
          </span>
        </span>
      </span>

      {#if option.type}
        <data
          class="max-w-40 rounded-sm border border-neutral-200 bg-white px-2 py-0.5 text-right text-[0.78rem] leading-5 text-neutral-600 [overflow-wrap:anywhere] max-sm:max-w-24 dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-400"
        >
          {option.type}
        </data>
      {/if}
    </summary>

    <div class="option-details px-4 pt-1 pb-4">
      <p class={`option-description ${paragraphClass} mt-3 mb-3`}>
        {stringifyDocValue(option.description)}
      </p>

      <dl class="option-fields mx-0 mt-0 mb-3 border-t border-neutral-200 dark:border-neutral-700">
        {#if option.type}
          <div
            class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)] dark:border-neutral-700"
          >
            <dt class="text-[0.9rem] font-semibold text-neutral-600 dark:text-neutral-400">Type</dt>
            <dd class="m-0 min-w-0">{option.type}</dd>
          </div>
        {/if}

        {#if option.default != null}
          <div
            class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)] dark:border-neutral-700"
          >
            <dt class="text-[0.9rem] font-semibold text-neutral-600 dark:text-neutral-400">Default</dt>
            <dd class="m-0 min-w-0">
              <code class={literalCodeClass}>{stringifyDocValue(option.default)}</code>
            </dd>
          </div>
        {/if}

        {#if option.example != null}
          <div
            class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)] dark:border-neutral-700"
          >
            <dt class="text-[0.9rem] font-semibold text-neutral-600 dark:text-neutral-400">Example</dt>
            <dd class="m-0 min-w-0">
              <code class={literalCodeClass}>{stringifyDocValue(option.example)}</code>
            </dd>
          </div>
        {/if}

        {#if option.declarations?.length}
          <div
            class="option-field option-field-source grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)] dark:border-neutral-700"
          >
            <dt class="text-[0.9rem] font-semibold text-neutral-600 dark:text-neutral-400">Declared by</dt>
            <dd class="m-0 min-w-0">
              <ul class="source-list m-0 list-none p-0">
                {#each option.declarations as declaration, index (`${option.name}-${index}`)}
                  <li class="my-0 mt-1 first:mt-0">
                    <code class={`filename ${filenameCodeClass}`}>
                      <a
                        class={`filename ${focusClass} text-[#0a3e68] underline underline-offset-2 decoration-[1px] hover:text-[#268598] [overflow-wrap:anywhere] dark:text-[#8ccff0] dark:hover:text-[#bde8fa]`}
                        href={declaration.url}>{declaration.name}</a
                      >
                    </code>
                  </li>
                {/each}
              </ul>
            </dd>
          </div>
        {/if}
      </dl>

      <a
        class={`${termLinkClass} inline-flex min-h-7 items-center text-[0.85rem] text-[#0a3e68] underline underline-offset-2 hover:text-[#268598] dark:text-[#8ccff0] dark:hover:text-[#bde8fa]`}
        href={`#${optionId}`}
      >
        Link to this option
      </a>
    </div>
  </details>
</li>
