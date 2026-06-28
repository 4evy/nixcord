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
  class={`toc rounded-sm border border-neutral-300 bg-neutral-50 shadow-sm ${
    isMainToc
      ? 'my-7 border-l-4 border-l-[#268598] px-5 py-4'
      : 'my-5 max-w-md border-l-4 border-l-neutral-300 px-4 py-3'
  }`}
  aria-labelledby={tocTitleId}
>
  {#if isMainToc}
    <h2 id={tocTitleId} class="toc-title mt-0 mb-2 text-[0.95rem] font-semibold text-neutral-900">{tocTitle}</h2>
  {:else}
    <h3 id={tocTitleId} class="toc-title mt-0 mb-2 text-[0.95rem] font-semibold text-neutral-900">{tocTitle}</h3>
  {/if}
  <ul class="toc-list m-0 list-none p-0">
    {#each items as item (item.href)}
      <li class="my-1">
        <a
          class={`inline-flex min-h-7 items-center rounded-sm px-1 text-[#0a3e68] no-underline hover:bg-white hover:text-[#268598] hover:underline ${focusClass}`}
          href={item.href}
        >
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>
