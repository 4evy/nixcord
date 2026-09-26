<script lang="ts">
let { name }: { name: string } = $props();

const splitAt = $derived(name.lastIndexOf('.') + 1);
</script>

<code class="option option-name"><span class="option-namespace">{name.slice(0, splitAt)}</span><span class="option-leaf">{name.slice(splitAt)}</span></code>
