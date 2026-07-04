<script lang="ts">
import hljs from 'highlight.js/lib/core';
import nix from 'highlight.js/lib/languages/nix';

let { code, language = 'nix' }: { code: string; language?: string } = $props();

hljs.registerLanguage('nix', nix);

const highlighted = $derived(
  applyTokenClasses(hljs.highlight(code.trimEnd(), { language, ignoreIllegals: true }).value)
);

const tokenClasses: Record<string, string> = {
  'hljs-attr': 'text-[#0a3e68] dark:text-[#8ccff0]',
  'hljs-built_in': 'text-[#0a3e68] dark:text-[#8ccff0]',
  'hljs-comment': 'text-neutral-500 italic dark:text-neutral-400',
  'hljs-keyword': 'font-semibold text-[#0a3e68] dark:text-[#8ccff0]',
  'hljs-literal': 'text-[#167cb9] dark:text-[#75c7f0]',
  'hljs-meta': 'text-neutral-600 dark:text-neutral-400',
  'hljs-number': 'text-[#167cb9] dark:text-[#75c7f0]',
  'hljs-operator': 'text-neutral-700 dark:text-neutral-300',
  'hljs-params': 'text-neutral-700 dark:text-neutral-300',
  'hljs-property': 'text-[#0a3e68] dark:text-[#8ccff0]',
  'hljs-punctuation': 'text-neutral-700 dark:text-neutral-300',
  'hljs-string': 'text-[#1f7a3a] dark:text-[#8fdda3]',
  'hljs-subst': 'text-neutral-950 dark:text-neutral-100',
  'hljs-symbol': 'text-[#9a4f13] dark:text-[#f0b77b]',
  'hljs-title': 'text-[#0a3e68] dark:text-[#8ccff0]',
  'hljs-type': 'text-[#9a4f13] dark:text-[#f0b77b]',
  'hljs-variable': 'text-[#9a4f13] dark:text-[#f0b77b]',
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
  class="my-4 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-0 font-mono text-[0.92rem] leading-6 shadow-sm dark:border-neutral-700 dark:bg-[#171d24]"
><code class={`block bg-transparent p-4 font-mono text-neutral-950 language-${language} dark:text-neutral-100`}>{@html highlighted}</code></pre>
