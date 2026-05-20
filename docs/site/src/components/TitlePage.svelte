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
    level?: 1 | 2;
    rule?: boolean;
  } = $props();
</script>

<div class="titlepage">
  <div>
    <div>
      {#if level === 1}
        <h1 {id} class="title">{title}</h1>
      {:else}
        <h2 {id} class="title">{title}</h2>
      {/if}
    </div>
    {#if subtitle}
      <div><h2 class="subtitle">{subtitle}</h2></div>
    {/if}
  </div>
  {#if rule}
    <hr />
  {/if}
</div>
