<script lang="ts">
let { name }: { name: string } = $props();

const splitAt = $derived(name.lastIndexOf('.') + 1);
</script>

<code class="font-mono text-[13px] wrap-anywhere"
  ><span class="font-normal text-muted">{name.slice(0, splitAt)}</span
  ><span class="font-semibold text-ink">{name.slice(splitAt)}</span></code
>
