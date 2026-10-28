<script lang="ts">
import ArrowRight from '@lucide/svelte/icons/arrow-right';
import Copy from '@lucide/svelte/icons/copy';
import { focusClass, paragraphClass, topSectionClass } from '../classes';
import { convertSettingsJsonToNix } from '../converter';
import TitlePage from './TitlePage.svelte';

const placeholder = `{
  "plugins": {
    "AlwaysExpandRoles": { "enabled": true, "hideArrow": false },
    "BetterFolders": { "enabled": false },
    "BetterGifPicker": { "enabled": true }
  },
  "useQuickCss": true,
  "themeLinks": []
}`;

let input = $state('');
let output = $state('');
let error = $state('');
let copyState = $state<'idle' | 'copied' | 'failed'>('idle');

$effect(() => {
  input;
  output = '';
  error = '';
  copyState = 'idle';
});

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
  <TitlePage id="sec-converter" title="Convert settings" level={2} />
  <p class={paragraphClass}>
    Convert a Vencord or Equicord backup, settings JSON, or plugins object locally in your browser.
    Review and merge the result into <code>programs.nixcord</code>; configure clients and custom
    plugins separately.
  </p>
  <details class="mt-2 text-sm">
    <summary class="cursor-pointer">Find your settings JSON</summary>
    <p class={paragraphClass}>
      In Discord settings, open the Vencord or Equicord page and select
      <strong>Open Settings Folder</strong>. Open <code>settings.json</code>
      and paste its contents below.
    </p>
    <p class={paragraphClass}>Default locations for mods installed in native Discord:</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard scrolling) -->
    <div
      class={`overflow-x-auto ${focusClass}`}
      tabindex="0"
      role="region"
      aria-label="Settings file locations"
    >
      <table class="w-full text-left text-sm">
        <thead>
          <tr>
            <th class="p-2" scope="col">Mod</th>
            <th class="p-2" scope="col">Linux</th>
            <th class="p-2" scope="col">macOS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="p-2" scope="row">Vencord</th>
            <td class="p-2"><code>~/.config/Vencord/settings/settings.json</code></td>
            <td class="p-2">
              <code>~/Library/Application Support/Vencord/settings/settings.json</code>
            </td>
          </tr>
          <tr>
            <th class="p-2" scope="row">Equicord</th>
            <td class="p-2"><code>~/.config/Equicord/settings/settings.json</code></td>
            <td class="p-2">
              <code>~/Library/Application Support/Equicord/settings/settings.json</code>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class={paragraphClass}>
      On Linux, replace <code>~/.config</code> with <code>$XDG_CONFIG_HOME</code>
      if set.
    </p>
    <p class={paragraphClass}>
      For Discord Stable installed through Flatpak, the default paths are:
    </p>
    <ul class="my-2 list-disc space-y-1 pl-5 wrap-anywhere">
      <li>
        Vencord:
        <code>~/.var/app/com.discordapp.Discord/config/Vencord/settings/settings.json</code>
      </li>
      <li>
        Equicord:
        <code>~/.var/app/com.discordapp.Discord/config/Equicord/settings/settings.json</code>
      </li>
    </ul>
    <p class={paragraphClass}>
      Flatpak sets its own <code>XDG_CONFIG_HOME</code> inside the sandbox; your terminal's value
      may differ. These paths follow Flatpak's config directory and each mod's default path logic.
    </p>
    <p class={paragraphClass}>
      Other clients such as Vesktop use their own data directories.
      <code>VENCORD_USER_DATA_DIR</code>, <code>EQUICORD_USER_DATA_DIR</code>, or
      <code>DISCORD_USER_DATA_DIR</code>
      overrides can also change the paths. Try
      <strong>Open Settings Folder</strong>
      to locate the active file. If the folder does not open, use a backup export instead.
    </p>
    <p class={paragraphClass}>
      Alternatively, open <strong>Backup &amp; Restore</strong> and choose
      <strong>Export Settings</strong>
      (Vencord) or
      <strong>Export All Settings</strong>
      (Equicord). Use the JSON file saved through the dialog, or your browser's downloads for the
      web version.
    </p>
  </details>
  <details class="mt-2 text-sm">
    <summary class="cursor-pointer">Where plugin settings go</summary>
    <p class={paragraphClass}>
      Known options go in <code>config.plugins</code>; unrecognized settings go in
      <code>extraConfig.plugins</code>.
    </p>
  </details>

  <form
    onsubmit={(event) => {
      event.preventDefault();
      convert();
    }}
  >
    <div class="mt-3 grid min-w-0 gap-3 @min-[48rem]:grid-cols-2">
      <label class="block">
        <span class="mb-2 block text-[0.95rem] font-semibold text-ink"
          >Vencord or Equicord JSON</span
        >
        <textarea
          class="h-48 min-h-24 w-full resize-y rounded-md border border-line bg-panel p-3 font-mono text-sm/5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'converter-error' : undefined}
          required
          bind:value={input}
          spellcheck="false"
          {placeholder}
        ></textarea>
      </label>

      <label class="block">
        <span class="mb-2 block text-[0.95rem] font-semibold text-ink">Nix configuration</span>
        <textarea
          class="h-48 min-h-24 w-full resize-y rounded-md border border-line bg-panel p-3 font-mono text-sm/5 text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          value={output}
          readonly
          spellcheck="false"
        ></textarea>
      </label>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <button
        class={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}
        type="submit"
        disabled={!input.trim()}
      >
        <ArrowRight size={16} aria-hidden="true" />
        Convert
      </button>
      <button
        class={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-page px-4 py-2 text-sm font-semibold hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50 ${focusClass}`}
        type="button"
        disabled={!output}
        onclick={copyOutput}
      >
        <Copy size={16} aria-hidden="true" />
        Copy
      </button>

      {#if copyState === 'copied'}
        <p class="m-0 text-sm text-[#1f7a3a] dark:text-[#8fdda3]" role="status">Copied</p>
      {:else if copyState === 'failed'}
        <p class="m-0 text-sm text-[#9a4f13] dark:text-[#f0b77b]" role="status">
          Could not copy. Select the output and copy it manually.
        </p>
      {/if}
    </div>

    {#if error}
      <p
        id="converter-error"
        class="my-4 rounded-r-sm border-l-4 border-[#ff6700] bg-orange-50 px-4 py-3 text-neutral-950 dark:bg-[#2a1d18] dark:text-neutral-100"
        role="alert"
      >
        {error}
      </p>
    {/if}
  </form>
</section>
