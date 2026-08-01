<script lang="ts">
import { onMount, tick } from 'svelte';
import { focusClass, paragraphClass, topSectionClass } from '../classes';
import {
  categoryFromSectionHash,
  filterAndGroupOptions,
  getPluginRoot,
  loadOptions,
  matchesOptionQuery,
  parseOptionSearchState,
  resolveOptionHashTarget,
  serializeOptionSearchState,
} from '../options';
import type {
  OptionCategory,
  OptionCategoryFilter,
  OptionEntry,
  OptionReferenceSearchState,
} from '../types';
import OptionSection from './OptionSection.svelte';
import OptionsToolbar from './OptionsToolbar.svelte';
import TitlePage from './TitlePage.svelte';

const initialSearchState =
  typeof window === 'undefined'
    ? ({ category: 'all', query: '' } satisfies OptionReferenceSearchState)
    : parseOptionSearchState(window.location.search);

let options = $state.raw<OptionEntry[]>([]);
let optionsLoaded = $state(false);
let optionsLoading = $state(false);
let optionsError = $state('');
let query = $state(initialSearchState.query);
let category = $state<OptionCategoryFilter>(initialSearchState.category);
let openCategory = $state<OptionCategory | null>(null);
let openPluginNames = $state.raw(new Set<string>());
let openOptionNames = $state.raw(new Set<string>());
let referenceElement = $state<HTMLElement | null>(null);
let loadPromise: Promise<void> | null = null;

const sections = $derived(filterAndGroupOptions(options, { category, query }));
const isFiltering = $derived(query.trim().length > 0);
const totalMatches = $derived(sections.reduce((total, section) => total + section.optionCount, 0));
const totalOptions = $derived(
  category === 'all'
    ? options.length
    : options.filter((option) => option.category === category).length
);

$effect(() => {
  if (typeof window === 'undefined') return;

  const nextSearch = serializeOptionSearchState(window.location.search, { category, query });
  if (nextSearch === window.location.search) return;

  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${nextSearch}${window.location.hash}`
  );
});

$effect(() => {
  if (!optionsLoaded) return;

  if (category !== 'all') {
    openCategory = category;
    return;
  }

  const currentSection = sections.find((section) => section.category === openCategory);
  if (currentSection && (!isFiltering || currentSection.optionCount > 0)) return;

  openCategory = isFiltering
    ? (sections.find((section) => section.optionCount > 0)?.category ?? null)
    : null;
});

onMount(() => {
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('popstate', handlePopState);

  const shouldLoadImmediately =
    isReferenceHash(window.location.hash) || query.trim().length > 0 || category !== 'all';
  let observer: IntersectionObserver | null = null;

  if (shouldLoadImmediately) {
    void ensureOptionsLoaded();
  } else if ('IntersectionObserver' in window && referenceElement) {
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        void ensureOptionsLoaded();
      },
      { rootMargin: '1000px 0px' }
    );
    observer.observe(referenceElement);
  } else {
    void ensureOptionsLoaded();
  }

  return () => {
    observer?.disconnect();
    window.removeEventListener('hashchange', handleHashChange);
    window.removeEventListener('popstate', handlePopState);
  };
});

function ensureOptionsLoaded(): Promise<void> {
  if (optionsLoaded) return Promise.resolve();
  if (loadPromise) return loadPromise;

  optionsLoading = true;
  optionsError = '';
  loadPromise = loadOptions()
    .then(async (loadedOptions) => {
      options = loadedOptions;
      optionsLoaded = true;
      optionsLoading = false;
      await tick();
      await revealCurrentHash();
    })
    .catch((error: unknown) => {
      optionsError = error instanceof Error ? error.message : 'Could not load options.json';
      optionsLoading = false;
      loadPromise = null;
    });

  return loadPromise;
}

function handleHashChange() {
  if (!isReferenceHash(window.location.hash)) return;
  void ensureOptionsLoaded().then(revealCurrentHash);
}

function handlePopState() {
  const nextState = parseOptionSearchState(window.location.search);
  query = nextState.query;
  category = nextState.category;

  if (isReferenceHash(window.location.hash) || query || category !== 'all') {
    void ensureOptionsLoaded().then(revealCurrentHash);
  }
}

async function revealCurrentHash() {
  if (!optionsLoaded || typeof window === 'undefined') return;

  const hash = window.location.hash;
  const categoryTarget = categoryFromSectionHash(hash);

  if (categoryTarget) {
    category = categoryTarget;
    openCategory = categoryTarget;
    await scrollToHashTarget(hash);
    return;
  }

  const optionTarget = resolveOptionHashTarget(options, hash);
  if (optionTarget) {
    category = optionTarget.category;
    openCategory = optionTarget.category;

    if (query && optionTarget.optionName) {
      const targetOption = options.find((option) => option.name === optionTarget.optionName);
      if (targetOption && !matchesOptionQuery(targetOption, query)) query = '';
    } else if (query && optionTarget.pluginName) {
      const pluginHasMatch = options.some(
        (option) =>
          getPluginRoot(option.name) === optionTarget.pluginName && matchesOptionQuery(option, query)
      );
      if (!pluginHasMatch) query = '';
    }

    if (optionTarget.pluginName) {
      const nextOpenPlugins = new Set(openPluginNames);
      nextOpenPlugins.add(optionTarget.pluginName);
      openPluginNames = nextOpenPlugins;
    }

    if (optionTarget.optionName) {
      const nextOpenOptions = new Set(openOptionNames);
      nextOpenOptions.add(optionTarget.optionName);
      openOptionNames = nextOpenOptions;
    }

    await scrollToHashTarget(hash);
    return;
  }

  if (hash === '#sec-options') await scrollToHashTarget(hash);
}

async function scrollToHashTarget(hash: string) {
  await tick();
  await nextAnimationFrame();
  const target = await waitForHashTarget(decodeURIComponent(hash.slice(1)));
  if (!target) return;

  await waitForStableLayout(target);
  alignHashTarget(target);
  await nextAnimationFrame();
  alignHashTarget(target);
}

async function waitForHashTarget(id: string): Promise<HTMLElement | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const target = document.getElementById(id);
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  return null;
}

async function waitForStableLayout(target: HTMLElement): Promise<void> {
  let previousTargetTop = -1;
  let previousBodyHeight = -1;
  let stableChecks = 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const targetTop = Math.round(target.getBoundingClientRect().top + window.scrollY);
    const bodyHeight = document.body.scrollHeight;

    if (targetTop === previousTargetTop && bodyHeight === previousBodyHeight) stableChecks += 1;
    else stableChecks = 0;

    if (stableChecks >= 2) return;
    previousTargetTop = targetTop;
    previousBodyHeight = bodyHeight;
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function alignHashTarget(target: HTMLElement | null) {
  if (!target) return;

  const stickyNavHeight =
    document.querySelector<HTMLElement>('.manual-nav')?.getBoundingClientRect().height ?? 0;
  const targetTop = target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: Math.max(0, targetTop - stickyNavHeight - 16) });
}

function handleSectionToggle(sectionCategory: OptionCategory, isOpen: boolean) {
  if (isOpen) openCategory = sectionCategory;
  else if (openCategory === sectionCategory) openCategory = null;
}

function handlePluginToggle(pluginName: string, isOpen: boolean) {
  openPluginNames = toggleSetValue(openPluginNames, pluginName, isOpen);
}

function handleOptionToggle(optionName: string, isOpen: boolean) {
  openOptionNames = toggleSetValue(openOptionNames, optionName, isOpen);
}

function toggleSetValue(values: Set<string>, value: string, included: boolean): Set<string> {
  const nextValues = new Set(values);
  if (included) nextValues.add(value);
  else nextValues.delete(value);
  return nextValues;
}

function isReferenceHash(hash: string): boolean {
  return hash === '#sec-options' || hash.startsWith('#options-') || hash.startsWith('#opt-');
}
</script>

<section bind:this={referenceElement} class={topSectionClass} aria-labelledby="sec-options">
  <TitlePage id="sec-options" title="Configuration Options" level={2} />
  <p class={paragraphClass}>Here is the complete reference for every available option in Nixcord. This list is auto-generated directly from the source modules</p>

  <section
    id="appendix-configuration-options"
    class="variablelist mt-5 scroll-mt-20"
    aria-labelledby="appendix-configuration-options-heading"
  >
    <h3 id="appendix-configuration-options-heading" class="sr-only">Configuration options reference</h3>

    {#if optionsError}
      <div
        class="my-3 max-w-[72ch] rounded-r-sm border-l-4 border-[#ff6700] bg-orange-50 px-4 py-3 text-neutral-950 dark:bg-[#2a1d18] dark:text-neutral-100"
        role="alert"
      >
        <p class="m-0">Unable to load options.json: {optionsError}</p>
        <button
          type="button"
          class={`mt-3 rounded-sm border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-100 dark:hover:bg-[#171d24] ${focusClass}`}
          onclick={() => void ensureOptionsLoaded()}
        >
          Retry
        </button>
      </div>
    {:else if optionsLoading || !optionsLoaded}
      <p class={paragraphClass} role="status">Loading configuration options…</p>
    {:else}
      <OptionsToolbar bind:query bind:category {totalMatches} {totalOptions} />

      {#if isFiltering && totalMatches === 0}
        <p
          class="my-4 rounded-r-sm border-l-4 border-neutral-300 bg-neutral-50 px-4 py-3 text-neutral-700 dark:border-neutral-600 dark:bg-[#171d24] dark:text-neutral-300"
          role="status"
        >
          No options match this search{category === 'all' ? '.' : ' in the selected category.'}
        </p>
      {:else}
        {#each sections as section (section.id)}
          <OptionSection
            {section}
            filtering={isFiltering}
            open={openCategory === section.category}
            {openPluginNames}
            {openOptionNames}
            onToggle={(isOpen) => handleSectionToggle(section.category, isOpen)}
            onPluginToggle={handlePluginToggle}
            onOptionToggle={handleOptionToggle}
          />
        {/each}
      {/if}
    {/if}
  </section>
</section>
