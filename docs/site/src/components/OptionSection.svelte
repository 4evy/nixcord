<script lang="ts">
  import type { OptionSection } from "../types";
  import OptionDefinition from "./OptionDefinition.svelte";

  let { section, open = false }: { section: OptionSection; open?: boolean } = $props();
</script>

<details id={section.id} class="option-section" {open}>
  <summary class="option-section-summary">
    <span class="option-section-heading">{section.title}</span>
    <span class="option-section-count">{section.options.length} options</span>
  </summary>

  <p class="option-section-description">{section.description}</p>

  <dl class="variablelist">
    {#each section.options as option (option.name)}
      <OptionDefinition {option} />
    {/each}
  </dl>
</details>
