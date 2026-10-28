<script lang="ts">
import Check from '@lucide/svelte/icons/check';
import Copy from '@lucide/svelte/icons/copy';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import nix from 'highlight.js/lib/languages/nix';
import shell from 'highlight.js/lib/languages/shell';
import typescript from 'highlight.js/lib/languages/typescript';
import { onDestroy } from 'svelte';
import { focusClass } from '../classes';

let {
  code,
  language = 'nix',
  label,
  wrap = false,
}: {
  code: string;
  language?: string;
  label?: string;
  wrap?: boolean;
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
  'hljs-attr': 'text-accent',
  'hljs-built_in': 'text-accent',
  'hljs-comment': 'text-muted italic',
  'hljs-keyword': 'font-semibold text-accent',
  'hljs-literal': 'text-[#167cb9] dark:text-[#75c7f0]',
  'hljs-meta': 'text-muted',
  'hljs-number': 'text-[#167cb9] dark:text-[#75c7f0]',
  'hljs-operator': 'text-ink',
  'hljs-params': 'text-ink',
  'hljs-property': 'text-accent',
  'hljs-punctuation': 'text-ink',
  'hljs-string': 'text-[#1f7a3a] dark:text-[#8fdda3]',
  'hljs-subst': 'text-ink',
  'hljs-symbol': 'text-[#9a4f13] dark:text-[#f0b77b]',
  'hljs-title': 'text-accent',
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

<figure class="my-4 min-w-0 overflow-hidden rounded-lg border border-line bg-panel">
  <figcaption
    class="flex items-center justify-between gap-3 border-b border-line py-1 pr-2 pl-4 text-xs text-muted"
  >
    <span>{displayLabel}</span>
    <button
      type="button"
      class={`inline-flex min-h-9 min-w-19 cursor-pointer items-center justify-center gap-1.5 rounded-md hover:bg-selected hover:text-ink ${focusClass}`}
      aria-label={`Copy ${displayLabel} code`}
      onclick={copyCode}
    >
      {#if copyState === 'copied'}
        <Check size={14} aria-hidden="true" />
      {:else}
        <Copy size={14} aria-hidden="true" />
      {/if}
      {copyLabel}
    </button>
    <span class="sr-only" role="status"
      >{copyState === 'copied' ? 'Code copied to clipboard' : ''}</span
    >
  </figcaption>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling) -->
  <pre
    tabindex="0"
    aria-label={`${displayLabel} code`}
    class={`m-0 max-w-full overflow-x-auto p-4 font-mono text-[13px]/6 ${wrap ? 'whitespace-pre-wrap wrap-anywhere' : 'whitespace-pre'} ${focusClass}`}
  ><code class="font-mono text-ink">{@html highlighted}</code></pre>
  {#if copyState === 'failed'}
    <p class="border-t border-line px-4 py-2 text-[13px]" role="status">
      Could not copy. Select the code and copy it manually.
    </p>
  {/if}
</figure>
