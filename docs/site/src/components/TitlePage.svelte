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

<header>
  <hgroup class="mb-4">
    {#if level === 1}
      <h1 {id} class="mb-4 mt-0 text-[2.35rem]/tight font-semibold tracking-tight text-ink">
        {title}
      </h1>
    {:else if level === 2}
      <h2 {id} class="mt-8 mb-4 text-2xl/tight font-semibold tracking-tight text-ink">
        {title}
      </h2>
    {:else}
      <h3 {id} class="mt-7 mb-3 text-[19px]/snug font-semibold tracking-tight text-ink">
        {title}
      </h3>
    {/if}
    {#if subtitle}
      <p class="mt-1 mb-3 max-w-[72ch] text-[1.25rem] font-normal text-muted wrap-anywhere">
        {subtitle}
      </p>
    {/if}
  </hgroup>
  {#if rule}
    <hr class="my-6 border-0 border-t border-line">
  {/if}
</header>
