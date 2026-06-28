<script lang="ts">
import { onMount, tick } from 'svelte';
import { paragraphClass, topSectionClass } from '../classes';
import { groupOptions, loadOptions } from '../options';
import type { OptionEntry, OptionSection as OptionSectionData } from '../types';
import OptionSection from './OptionSection.svelte';
import TitlePage from './TitlePage.svelte';

let options = $state.raw<OptionEntry[]>([]);
let sections = $state.raw<OptionSectionData[]>([]);
let optionsLoading = $state(true);
let optionsError = $state('');

loadOptions()
  .then(async (loadedOptions) => {
    options = loadedOptions;
    sections = groupOptions(loadedOptions);
    optionsLoading = false;
    await tick();
    revealCurrentHash();
  })
  .catch((error: unknown) => {
    optionsError = error instanceof Error ? error.message : 'Could not load options.json';
    optionsLoading = false;
  });

onMount(() => {
  window.addEventListener('hashchange', revealCurrentHash);

  return () => {
    window.removeEventListener('hashchange', revealCurrentHash);
  };
});

function revealCurrentHash() {
  if (!window.location.hash.startsWith('#opt-')) return;

  const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  let parent = target;

  while (parent != null) {
    if (parent instanceof HTMLDetailsElement) {
      parent.open = true;
    }

    parent = parent.parentElement;
  }

  target?.closest('.option-definition, .option-plugin')?.scrollIntoView({ block: 'start' });
}
</script>

<section class={topSectionClass} aria-labelledby="sec-options">
  <TitlePage id="sec-options" title="Configuration Options" level={2} />
  <p class={paragraphClass}>Here is the complete reference for every available option in Nixcord. This list is auto-generated directly from the source modules</p>

  <section
    id="appendix-configuration-options"
    class="variablelist mt-5 scroll-mt-4"
    aria-labelledby="appendix-configuration-options-heading"
  >
    <h3 id="appendix-configuration-options-heading" class="sr-only">Configuration options reference</h3>
    {#if optionsError}
      <p
        class="my-3 max-w-[72ch] rounded-r-sm border-l-4 border-[#ff6700] bg-orange-50 px-4 py-3 text-neutral-950"
        role="alert"
      >
        Unable to load options.json: {optionsError}
      </p>
    {:else if optionsLoading}
      <p class={paragraphClass} role="status">Loading options...</p>
    {:else}
      {#each sections as section (section.id)}
        <OptionSection {section} />
      {/each}
    {/if}
  </section>
</section>
