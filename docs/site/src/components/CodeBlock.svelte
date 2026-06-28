<script lang="ts">
import hljs from 'highlight.js/lib/core';
import nix from 'highlight.js/lib/languages/nix';

let { code, language = 'nix' }: { code: string; language?: string } = $props();

hljs.registerLanguage('nix', nix);

const highlighted = $derived(
  applyTokenClasses(hljs.highlight(code.trimEnd(), { language, ignoreIllegals: true }).value)
);

const tokenClasses: Record<string, string> = {
  'hljs-attr': 'text-[#0a3e68]',
  'hljs-built_in': 'text-[#0a3e68]',
  'hljs-comment': 'text-neutral-500 italic',
  'hljs-keyword': 'font-semibold text-[#0a3e68]',
  'hljs-literal': 'text-[#167cb9]',
  'hljs-meta': 'text-neutral-600',
  'hljs-number': 'text-[#167cb9]',
  'hljs-operator': 'text-neutral-700',
  'hljs-params': 'text-neutral-700',
  'hljs-property': 'text-[#0a3e68]',
  'hljs-punctuation': 'text-neutral-700',
  'hljs-string': 'text-[#1f7a3a]',
  'hljs-subst': 'text-neutral-950',
  'hljs-symbol': 'text-[#9a4f13]',
  'hljs-title': 'text-[#0a3e68]',
  'hljs-type': 'text-[#9a4f13]',
  'hljs-variable': 'text-[#9a4f13]',
};

function applyTokenClasses(html: string) {
  return html.replace(/class="([^"]+)"/g, (_match, classNames: string) => {
    const classes = classNames
      .split(/\s+/)
      .flatMap((className) => tokenClasses[className]?.split(' ') ?? []);

    return classes.length > 0 ? `class="${Array.from(new Set(classes)).join(' ')}"` : '';
  });
}
</script>

<pre
  class="my-4 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-0 font-mono text-[0.92rem] leading-6 shadow-sm"
><code class={`block bg-transparent p-4 font-mono text-neutral-950 language-${language}`}>{@html highlighted}</code></pre>
