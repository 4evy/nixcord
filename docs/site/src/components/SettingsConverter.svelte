<script lang="ts">
import { paragraphClass, topSectionClass } from '../classes';
import { convertSettingsJsonToNix } from '../converter';
import TitlePage from './TitlePage.svelte';

const placeholder = `{
  "settings": {
    "plugins": {
      "CustomRPC": {
        "enabled": true,
        "appID": "1234567890",
        "buttonOneURL": "https://example.com"
      }
    }
  },
  "quickCss": ""
}`;

let input = $state('');
let output = $state('');
let error = $state('');
let copyState = $state<'idle' | 'copied' | 'failed'>('idle');

function convert() {
  error = '';
  copyState = 'idle';

  try {
    const result = convertSettingsJsonToNix(input);
    output = result.output;
  } catch (conversionError) {
    output = '';
    error = conversionError instanceof Error ? conversionError.message : 'Could not convert JSON.';
  }
}

async function copyOutput() {
  if (!output) return;

  try {
    await navigator.clipboard.writeText(output);
    copyState = 'copied';
  } catch {
    copyState = 'failed';
  }
}
</script>

<section class={topSectionClass} aria-labelledby="sec-converter">
  <TitlePage id="sec-converter" title="Settings Converter" level={2} />
  <p class={paragraphClass}>Paste a Vencord or Equicord settings backup, raw settings JSON, or just the plugins object. The converter returns a Nixcord snippet with known plugin options in <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.92em] text-neutral-900 dark:bg-[#1f2b35] dark:text-neutral-100">config.plugins</code> and unsupported/raw plugin settings preserved in <code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.92em] text-neutral-900 dark:bg-[#1f2b35] dark:text-neutral-100">extraConfig.plugins</code>.</p>

  <div class="mt-5 grid gap-5 lg:grid-cols-2">
    <label class="block">
      <span class="mb-2 block text-[0.95rem] font-semibold text-neutral-900 dark:text-neutral-100">Vencord or Equicord JSON</span>
      <textarea
        class="min-h-[22rem] w-full resize-y rounded-md border border-neutral-300 bg-neutral-50 p-3 font-mono text-[0.9rem] leading-5 text-neutral-950 shadow-sm outline-none focus:border-[#167cb9] focus:ring-3 focus:ring-[#167cb9]/20 dark:border-neutral-700 dark:bg-[#171d24] dark:text-neutral-100"
        bind:value={input}
        spellcheck="false"
        {placeholder}
      ></textarea>
    </label>

    <label class="block">
      <span class="mb-2 block text-[0.95rem] font-semibold text-neutral-900 dark:text-neutral-100">Nixcord attrs</span>
      <textarea
        class="min-h-[22rem] w-full resize-y rounded-md border border-neutral-300 bg-neutral-50 p-3 font-mono text-[0.9rem] leading-5 text-neutral-950 shadow-sm outline-none focus:border-[#167cb9] focus:ring-3 focus:ring-[#167cb9]/20 dark:border-neutral-700 dark:bg-[#171d24] dark:text-neutral-100"
        value={output}
        readonly
        spellcheck="false"
      ></textarea>
    </label>
  </div>

  <div class="mt-4 flex flex-wrap items-center gap-3">
    <button
      class="rounded-sm bg-[#0a3e68] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#167cb9] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#f6cf5e] disabled:cursor-not-allowed disabled:bg-neutral-400 dark:bg-[#8ccff0] dark:text-[#0f1318] dark:hover:bg-[#bde8fa]"
      type="button"
      disabled={!input.trim()}
      onclick={convert}
    >
      Convert
    </button>
    <button
      class="rounded-sm border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm hover:bg-neutral-50 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#f6cf5e] disabled:cursor-not-allowed disabled:text-neutral-400 dark:border-neutral-700 dark:bg-[#12171d] dark:text-neutral-100 dark:hover:bg-[#171d24] dark:disabled:text-neutral-500"
      type="button"
      disabled={!output}
      onclick={copyOutput}
    >
      Copy
    </button>

    {#if copyState === 'copied'}
      <p class="m-0 text-sm text-[#1f7a3a] dark:text-[#8fdda3]" role="status">Copied</p>
    {:else if copyState === 'failed'}
      <p class="m-0 text-sm text-[#9a4f13] dark:text-[#f0b77b]" role="status">Copy failed</p>
    {/if}
  </div>

  {#if error}
    <p class="my-4 rounded-r-sm border-l-4 border-[#ff6700] bg-orange-50 px-4 py-3 text-neutral-950 dark:bg-[#2a1d18] dark:text-neutral-100" role="alert">
      {error}
    </p>
  {/if}
</section>
