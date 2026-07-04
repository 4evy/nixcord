<script lang="ts">
import { focusClass } from '../classes';

type TocItem = {
  href: string;
  label: string;
};

let {
  items,
  title,
}: {
  items: TocItem[];
  title?: string;
} = $props();

const isMainToc = $derived(title != null);
const tocTitle = $derived(title ?? 'In This Section');
const tocTitleId = $derived(`${items[0]?.href.replace(/^#/, '') ?? 'root'}-toc-title`);
</script>

<nav
  class={`toc rounded-sm border border-neutral-300 bg-neutral-50 shadow-sm dark:border-neutral-700 dark:bg-[#171d24] ${
    isMainToc
      ? 'my-7 border-l-4 border-l-[#268598] px-5 py-4 dark:border-l-[#4eb3c7]'
      : 'my-5 max-w-md border-l-4 border-l-neutral-300 px-4 py-3 dark:border-l-neutral-600'
  }`}
  aria-labelledby={tocTitleId}
>
  {#if isMainToc}
    <h2 id={tocTitleId} class="toc-title mt-0 mb-2 text-[0.95rem] font-semibold text-neutral-900 dark:text-neutral-100">{tocTitle}</h2>
  {:else}
    <h3 id={tocTitleId} class="toc-title mt-0 mb-2 text-[0.95rem] font-semibold text-neutral-900 dark:text-neutral-100">{tocTitle}</h3>
  {/if}
  <ul class="toc-list m-0 list-none p-0">
    {#each items as item (item.href)}
      <li class="my-1">
        <a
          class={`inline-flex min-h-7 items-center rounded-sm px-1 text-[#0a3e68] no-underline hover:bg-white hover:text-[#268598] hover:underline dark:text-[#8ccff0] dark:hover:bg-[#12171d] dark:hover:text-[#bde8fa] ${focusClass}`}
          href={item.href}
        >
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>
