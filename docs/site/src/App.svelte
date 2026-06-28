<script lang="ts">
import { mainToc, revision } from './content';
import IntroductionSection from './components/IntroductionSection.svelte';
import OptionsReference from './components/OptionsReference.svelte';
import PrefaceSection from './components/PrefaceSection.svelte';
import TableOfContents from './components/TableOfContents.svelte';
import TitlePage from './components/TitlePage.svelte';
</script>

<svelte:head>
  <title>Nixcord manual</title>
  <meta name="description" content="Nixcord manual" />
</svelte:head>

<main
  class="book mx-auto min-h-screen max-w-[62rem] border-x border-neutral-300 bg-white px-5 py-8 text-[16px] shadow-[0_22px_70px_rgba(15,23,42,0.08)] sm:px-10 lg:px-16 max-sm:border-x-0 max-sm:px-4 max-sm:shadow-none"
>
  <TitlePage id="nixcord-manual" title="Nixcord manual" subtitle={`Version ${revision}`} rule />
  <TableOfContents title="Table of Contents" items={mainToc} />
  <PrefaceSection />
  <IntroductionSection />
  <OptionsReference />
</main>
