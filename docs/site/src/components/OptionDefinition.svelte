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
  option,
  mutedBorder = false,
}: { headingLevel?: 4 | 5; label?: string; option: OptionEntry; mutedBorder?: boolean } = $props();

const optionId = $derived(`opt-${option.name}`);
const headingId = $derived(`${optionId}-heading`);
</script>

<li class="option-item my-0">
  <article
    id={optionId}
    class={`option-definition mt-5 scroll-mt-4 rounded-sm border border-neutral-300 border-l-4 bg-white shadow-sm target:!border-l-[#ec733b] target:bg-orange-50 target:shadow-md [contain-intrinsic-size:auto_240px] [content-visibility:auto] ${
      mutedBorder ? 'border-l-neutral-300' : 'border-l-[#0a3e68]'
    }`}
    aria-labelledby={headingId}
  >
    <header class="option-heading border-b border-neutral-200 bg-neutral-50 px-4 py-3">
      {#if headingLevel === 4}
        <h4 id={headingId} class="my-0 text-[1rem] leading-snug font-semibold">
          <a class={termLinkClass} href={`#${optionId}`} aria-label={option.name}>
            <code class={`option ${optionCodeClass}`}>{label}</code>
          </a>
        </h4>
      {:else}
        <h5 id={headingId} class="my-0 text-[1rem] leading-snug font-semibold">
          <a class={termLinkClass} href={`#${optionId}`} aria-label={option.name}>
            <code class={`option ${optionCodeClass}`}>{label}</code>
          </a>
        </h5>
      {/if}
    </header>

    <p class={`option-description ${paragraphClass} mx-4 mt-4 mb-3`}>
      {stringifyDocValue(option.description)}
    </p>

    <dl class="option-fields mx-4 mt-0 mb-4 border-t border-neutral-200">
      {#if option.type}
        <div
          class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Type</dt>
          <dd class="m-0 min-w-0">{option.type}</dd>
        </div>
      {/if}

      {#if option.default != null}
        <div
          class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Default</dt>
          <dd class="m-0 min-w-0">
            <code class={literalCodeClass}>{stringifyDocValue(option.default)}</code>
          </dd>
        </div>
      {/if}

      {#if option.example != null}
        <div
          class="option-field grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Example</dt>
          <dd class="m-0 min-w-0">
            <code class={literalCodeClass}>{stringifyDocValue(option.example)}</code>
          </dd>
        </div>
      {/if}

      {#if option.declarations?.length}
        <div
          class="option-field option-field-source grid gap-1 border-b border-neutral-200 py-2.5 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <dt class="text-[0.9rem] font-semibold text-neutral-600">Declared by</dt>
          <dd class="m-0 min-w-0">
            <ul class="source-list m-0 list-none p-0">
              {#each option.declarations as declaration, index (`${option.name}-${index}`)}
                <li class="my-0 mt-1 first:mt-0">
                  <code class={`filename ${filenameCodeClass}`}>
                    <a
                      class={`filename ${focusClass} text-[#0a3e68] underline underline-offset-2 decoration-[1px] hover:text-[#268598] [overflow-wrap:anywhere]`}
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
  </article>
</li>
