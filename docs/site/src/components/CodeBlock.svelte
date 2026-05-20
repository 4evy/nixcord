<script lang="ts">
  import hljs from "highlight.js/lib/core";
  import nix from "highlight.js/lib/languages/nix";

  let { code, language = "nix" }: { code: string; language?: string } = $props();

  hljs.registerLanguage("nix", nix);

  type HighlightNode = {
    children: HighlightChild[];
    scope?: string;
  };

  type HighlightChild = HighlightNode | string;

  const highlighted = $derived(
    hljs.highlight(code.trimEnd(), { language, ignoreIllegals: true })._emitter
      .rootNode as HighlightNode,
  );

  function tokenClass(scope?: string) {
    return scope
      ?.split(".")
      .map((part, index) => (index === 0 ? `hljs-${part}` : part))
      .join(" ");
  }
</script>

<!-- Keep this markup whitespace-tight because <pre> preserves template indentation. -->
{#snippet renderToken(token: HighlightChild)}{#if typeof token === "string"}{token}{:else}<span class={tokenClass(token.scope)}>{#each token.children as child, index (index)}{@render renderToken(child)}{/each}</span>{/if}{/snippet}

<pre><code class={`hljs programlisting language-${language}`}>{#each highlighted.children as child, index (index)}{@render renderToken(child)}{/each}</code></pre>
