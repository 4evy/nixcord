<script lang="ts">
import { ModeWatcher } from 'mode-watcher';
import { mainToc, revision } from './content';
import IntroductionSection from './components/IntroductionSection.svelte';
import ModeToggle from './components/ModeToggle.svelte';
import OptionsReference from './components/OptionsReference.svelte';
import PrefaceSection from './components/PrefaceSection.svelte';
import SettingsConverter from './components/SettingsConverter.svelte';
import TableOfContents from './components/TableOfContents.svelte';
import TitlePage from './components/TitlePage.svelte';
</script>

<svelte:head>
  <title>Nixcord manual</title>
  <meta name="description" content="Nixcord manual" />
</svelte:head>

<ModeWatcher defaultMode="system" themeColors={{ light: '#f5f5f5', dark: '#0f1318' }} />

<div class="min-h-screen bg-neutral-100 text-neutral-950 dark:bg-[#0f1318] dark:text-neutral-100">
  <a
    class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-sm focus:bg-white focus:px-3 focus:py-2 focus:text-[#0a3e68] focus:shadow-md focus:outline-3 focus:outline-offset-3 focus:outline-[#f6cf5e] dark:focus:bg-[#171d24] dark:focus:text-[#8ccff0]"
    href="#content"
  >
    Skip to main content
  </a>

  <main
    id="content"
    class="book relative mx-auto min-h-screen max-w-[62rem] border-x border-neutral-300 bg-white px-5 py-8 text-[16px] shadow-[0_22px_70px_rgba(15,23,42,0.08)] sm:px-10 lg:px-16 max-sm:border-x-0 max-sm:px-4 max-sm:shadow-none dark:border-neutral-800 dark:bg-[#12171d] dark:shadow-[0_22px_70px_rgba(0,0,0,0.28)]"
  >
    <div class="absolute top-5 right-5 sm:top-6 sm:right-10 lg:right-16">
      <ModeToggle />
    </div>

    <TitlePage id="nixcord-manual" title="Nixcord manual" subtitle={`Version ${revision}`} rule />
    <TableOfContents title="Table of Contents" items={mainToc} />
    <PrefaceSection />
    <IntroductionSection />
    <SettingsConverter />
    <OptionsReference />
  </main>
</div>
