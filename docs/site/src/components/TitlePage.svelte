<script lang="ts">
let {
  id,
  title,
  subtitle,
  level = 1,
  rule = false,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  level?: 1 | 2 | 3;
  rule?: boolean;
} = $props();
</script>

<header class="titlepage">
  <hgroup class="mb-5">
    {#if level === 1}
      <h1 {id} class="title mb-4 mt-0 scroll-mt-4 text-[2.35rem] leading-tight font-semibold text-[#0a3e68] dark:text-[#8ccff0]">
        {title}
      </h1>
    {:else if level === 2}
      <h2 {id} class="title mt-8 mb-4 scroll-mt-4 text-[1.9rem] leading-tight font-semibold text-[#0a3e68] dark:text-[#8ccff0]">
        {title}
      </h2>
    {:else}
      <h3 {id} class="title mt-7 mb-3 scroll-mt-4 text-[1.45rem] leading-snug font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h3>
    {/if}
    {#if subtitle}
      <p class="mt-1 mb-3 max-w-[72ch] text-[1.25rem] font-normal text-neutral-600 [overflow-wrap:anywhere] dark:text-neutral-400">
        {subtitle}
      </p>
    {/if}
  </hgroup>
  {#if rule}
    <hr class="my-6 border-0 border-t border-neutral-300 dark:border-neutral-700" />
  {/if}
</header>
