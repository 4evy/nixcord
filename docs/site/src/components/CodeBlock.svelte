<script lang="ts">
import Check from '@lucide/svelte/icons/check';
import Copy from '@lucide/svelte/icons/copy';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import nix from 'highlight.js/lib/languages/nix';
import shell from 'highlight.js/lib/languages/shell';
import typescript from 'highlight.js/lib/languages/typescript';
import { onDestroy } from 'svelte';

let {
  code,
  language = 'nix',
  label,
}: {
  code: string;
  language?: string;
  label?: string;
} = $props();

let copyState = $state<'idle' | 'copied' | 'failed'>('idle');
let resetTimer: ReturnType<typeof setTimeout> | undefined;
const languageLabels: Record<string, string> = {
  json: 'JSON',
  nix: 'Nix',
  shell: 'Terminal',
  typescript: 'TypeScript',
};
const displayLabel = $derived(label ?? languageLabels[language] ?? language);
const copyLabel = $derived(copyState === 'copied' ? 'Copied' : 'Copy');

onDestroy(() => clearTimeout(resetTimer));

$effect(() => {
  // Reset feedback when the selected installation example changes
  code;
  copyState = 'idle';
  clearTimeout(resetTimer);
});

async function copyCode() {
  clearTimeout(resetTimer);
  try {
    await navigator.clipboard.writeText(code.trimEnd());
    copyState = 'copied';
    resetTimer = setTimeout(() => {
      copyState = 'idle';
    }, 2500);
  } catch {
    copyState = 'failed';
  }
}

hljs.registerLanguage('nix', nix);
hljs.registerLanguage('json', json);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('shell', shell);

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

<div class="code-block">
  <div class="code-block-header">
    <span>{displayLabel}</span>
    <button type="button" class="copy-code" aria-label={`Copy ${displayLabel} code`} onclick={copyCode}>
      {#if copyState === 'copied'}
        <Check size={14} aria-hidden="true" />
      {:else}
        <Copy size={14} aria-hidden="true" />
      {/if}
      {copyLabel}
    </button>
    <span class="sr-only" role="status">{copyState === 'copied' ? 'Code copied to clipboard' : ''}</span>
  </div>
  <pre class="overflow-x-auto p-0 font-mono leading-6"><code class={`block bg-transparent p-4 font-mono text-neutral-950 language-${language} dark:text-neutral-100`}>{@html highlighted}</code></pre>
  {#if copyState === 'failed'}
    <p class="copy-error" role="status">Could not copy. Select the code and copy it manually.</p>
  {/if}
</div>
