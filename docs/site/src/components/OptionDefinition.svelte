<script lang="ts">
import { filenameCodeClass, focusClass, literalCodeClass, optionCodeClass, termLinkClass } from '../classes';
import { stringifyDocValue } from '../options';
import type { OptionEntry } from '../types';

let {
  label = option.name,
  option,
  mutedBorder = false,
}: { label?: string; option: OptionEntry; mutedBorder?: boolean } = $props();

const optionId = $derived(`opt-${option.name}`);
</script>

<div
  class={`option-definition mt-5 rounded-sm border border-neutral-300 border-l-4 bg-white shadow-sm [contain-intrinsic-size:auto_240px] [content-visibility:auto] [&:has(.option-heading:target)]:!border-l-[#ec733b] [&:has(.option-heading:target)]:bg-orange-50 [&:has(.option-heading:target)]:shadow-md ${
    mutedBorder ? 'border-l-neutral-300' : 'border-l-[#0a3e68]'
  }`}
>
  <dt id={optionId} class="option-heading scroll-mt-4 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
    <a class={termLinkClass} href={`#${optionId}`} aria-label={option.name}>
      <code class={`option ${optionCodeClass}`}>{label}</code>
    </a>
  </dt>
  <dd class="option-body m-0 px-4 py-4">
    <p class="mt-0 mb-3 max-w-[72ch]">{stringifyDocValue(option.description)}</p>

    <dl class="option-fields m-0 border-t border-neutral-200">
      {#if option.type}
        <div class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Type</dt>
          <dd class="m-0 min-w-0">{option.type}</dd>
        </div>
      {/if}

      {#if option.default != null}
        <div class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Default</dt>
          <dd class="m-0 min-w-0"><code class={literalCodeClass}>{stringifyDocValue(option.default)}</code></dd>
        </div>
      {/if}

      {#if option.example != null}
        <div class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Example</dt>
          <dd class="m-0 min-w-0"><code class={literalCodeClass}>{stringifyDocValue(option.example)}</code></dd>
        </div>
      {/if}

      {#if option.declarations?.length}
        <div class="option-field option-field-source grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Declared by</dt>
          <dd class="m-0 min-w-0">
            <ul class="source-list m-0 list-none p-0">
              {#each option.declarations as declaration, index (`${option.name}-${index}`)}
                <li class="my-0 mt-1 first:mt-0">
                  <code class={`filename ${filenameCodeClass}`}>
                    <a class={`filename ${focusClass} text-[#0a3e68] underline underline-offset-2 decoration-[1px] hover:text-[#268598] [overflow-wrap:anywhere]`} href={declaration.url}>{declaration.name}</a>
                  </code>
                </li>
              {/each}
            </ul>
          </dd>
        </div>
      {/if}
    </dl>
  </dd>
</div>
