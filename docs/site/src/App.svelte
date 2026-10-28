<script lang="ts">
import { ModeWatcher } from 'mode-watcher';
import { revision } from './content';
import IntroductionSection from './components/IntroductionSection.svelte';
import ManualNav from './components/ManualNav.svelte';
import OptionsReference from './components/OptionsReference.svelte';
import PrefaceSection from './components/PrefaceSection.svelte';
import SettingsConverter from './components/SettingsConverter.svelte';

import ArrowRight from '@lucide/svelte/icons/arrow-right';
</script>

<svelte:head>
  <title>Nixcord manual</title>
  <meta
    name="description"
    content="Install Discord clients and configure plugins and themes with Nixcord. Setup instructions, settings converter, and option reference."
  >
</svelte:head>

<ModeWatcher defaultMode="system" themeColors={{ light: '#ffffff', dark: '#12171d' }} />

<div class="mx-auto max-w-[1440px] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
  <a
    class="fixed -top-24 left-4 z-60 rounded-md bg-page px-5 py-3 text-accent focus:top-3 focus-visible:outline-2 focus-visible:outline-accent"
    href="#content"
    >Skip to main content</a
  >
  <ManualNav />
  <main
    id="content"
    class="@container min-w-0 px-5 pt-7 pb-16 text-[15px]/[1.7] sm:px-7 sm:pt-9 sm:pb-20 lg:max-w-[1056px] lg:px-[clamp(32px,5vw,72px)] lg:pt-12 lg:pb-25 [&_[id]]:scroll-mt-36 lg:[&_[id]]:scroll-mt-8 [&_:not(pre)>code]:wrap-anywhere [&_:is(a,button,summary)]:focus-visible:outline-2 [&_:is(a,button,summary)]:focus-visible:outline-offset-3 [&_:is(a,button,summary)]:focus-visible:outline-accent"
    tabindex="-1"
  >
    <header id="nixcord-manual" class="border-b border-line pb-7">
      <p class="mb-3 text-[13px] font-semibold text-accent">Nixcord documentation</p>
      <h1
        class="mb-4 text-[clamp(28px,4cqi,38px)] leading-[1.15] font-semibold tracking-tight text-balance"
      >
        Discord, configured with Nix
      </h1>
      <p class="max-w-[60ch] text-base/[1.65] text-muted">
        Keep your Discord clients, plugins, and themes in one reproducible configuration. Set up
        Nixcord with Home Manager, NixOS, or nix-darwin.
      </p>
      <nav class="mt-6 flex flex-wrap gap-3" aria-label="Quick links">
        <a
          class="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90"
          href="#getting-started"
          >Get started <ArrowRight size={16} aria-hidden="true" /></a
        >
        <a
          class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold text-accent hover:border-accent hover:bg-selected"
          href="#sec-options"
          >Browse options <ArrowRight size={16} aria-hidden="true" /></a
        >
      </nav>
      <footer
        class="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6"
      >
        <p class="text-[13px] text-muted">
          Already have settings?
          <a
            class="inline-flex items-center gap-1 text-accent underline-offset-3 hover:underline"
            href="#sec-converter"
            >Convert your JSON to Nix <ArrowRight size={14} aria-hidden="true" /></a
          >
        </p>
        <p class="text-xs text-muted">
          Revision
          <a
            class="underline underline-offset-3 hover:text-accent"
            href={`https://github.com/4evy/nixcord/commit/${revision}`}
            title={revision}
            ><code class="ml-1">{revision.slice(0, 8)}</code></a
          >
        </p>
      </footer>
    </header>
    <OptionsReference />
    <SettingsConverter />
    <PrefaceSection />
    <IntroductionSection />
  </main>
</div>

<style>
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-page: light-dark(#fff, #12171d);
  --color-panel: light-dark(#f7f8fa, #171d24);
  --color-ink: light-dark(#24292f, #e1e6ed);
  --color-muted: light-dark(#626b76, #9ca8b5);
  --color-line: light-dark(#e1e4e8, #2b333d);
  --color-accent: light-dark(#245eaa, #8ccff0);
  --color-selected: light-dark(#eaf1fb, #202e3b);
  --color-on-accent: light-dark(#fff, #12171d);
}
</style>
