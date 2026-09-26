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
  <meta name="description" content="Install Discord clients and configure plugins and themes with Nixcord. Setup instructions, settings converter, and option reference." />
</svelte:head>

<ModeWatcher defaultMode="system" themeColors={{ light: '#f5f5f5', dark: '#0f1318' }} />

<div class="docs-shell">
  <a class="skip-link" href="#content">Skip to main content</a>
  <ManualNav />
  <main id="content" class="book docs-content">
    <header class="docs-intro">
      <h1 id="nixcord-manual">Nixcord documentation</h1>
      <p class="intro-description">Install Discord clients and configure plugins and themes with Home Manager, NixOS, or nix-darwin.</p>
      <div class="intro-footer">
        <nav class="intro-links" aria-label="Quick links">
          <a href="#sec-options">Search options <ArrowRight size={15} aria-hidden="true" /></a>
          <a href="#getting-started">Get started <ArrowRight size={15} aria-hidden="true" /></a>
        </nav>
        <p class="revision">Revision <a href={`https://github.com/4evy/nixcord/commit/${revision}`} title={revision}><code>{revision.slice(0, 8)}</code></a></p>
      </div>
    </header>
    <OptionsReference />
    <SettingsConverter />
    <PrefaceSection />
    <IntroductionSection />
  </main>
</div>
