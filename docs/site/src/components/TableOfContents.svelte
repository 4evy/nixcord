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
const tocTitle = $derived(title ?? 'In this section');
const tocTitleId = $derived(`${items[0]?.href.replace(/^#/, '') ?? 'root'}-toc-title`);
</script>

<nav
  class="my-5 max-w-md border-l-2 border-line px-4 py-1 text-[13px] lg:hidden"
  aria-labelledby={tocTitleId}
>
  {#if isMainToc}
    <h2 id={tocTitleId} class="mt-0 mb-2 text-[0.95rem] font-semibold text-ink">
      {tocTitle}
    </h2>
  {:else}
    <h3 id={tocTitleId} class="mt-0 mb-2 text-[0.95rem] font-semibold text-ink">
      {tocTitle}
    </h3>
  {/if}
  <ul class="m-0 list-none p-0">
    {#each items as item (item.href)}
      <li class="my-1">
        <a
          class={`inline-flex min-h-9 items-center rounded-sm px-1 text-accent hover:underline ${focusClass}`}
          href={item.href}
        >
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>
