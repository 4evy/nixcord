<script lang="ts">
import { linkClass, paragraphClass, sectionClass, topSectionClass } from '../classes';
import { prefaceToc } from '../content';
import ParserWalkthrough from './ParserWalkthrough.svelte';
import TableOfContents from './TableOfContents.svelte';
import TitlePage from './TitlePage.svelte';
</script>

<section class={`${topSectionClass} guide-section`} aria-labelledby="sec-preface">
  <TitlePage id="sec-preface" title="Before you start" level={2} />
  <TableOfContents items={prefaceToc} />

  <section class={sectionClass} aria-labelledby="prerequisites">
    <TitlePage id="prerequisites" title="Prerequisites" level={3} />
    <p class={paragraphClass}>Start with a working Home Manager, NixOS, or nix-darwin configuration. Nixcord is a module you add to that configuration. Home Manager is optional when you use a system module.</p>
  </section>

  <section class={sectionClass} aria-labelledby="reporting-issues">
    <TitlePage id="reporting-issues" title="Report a problem" level={3} />
    <p class={paragraphClass}>Search the <a class={`link ${linkClass}`} href="https://github.com/4evy/nixcord/issues">issue tracker</a> for your error or client name before opening a new issue.</p>
    <p class={paragraphClass}>Include the smallest configuration that reproduces the problem, your operating system and architecture, the Nixcord revision, and the full error output. Describe what you expected and what happened. Remove tokens and other private data from logs.</p>
  </section>

  <section class={sectionClass} aria-labelledby="contributing">
    <TitlePage id="contributing" title="Contribute" level={3} />
    <p class={paragraphClass}>Send a pull request with the problem, your fix, and how you checked it. For parser changes, link the upstream plugin and show which Nix option was missing or wrong. Fix the extraction code rather than editing generated plugin JSON.</p>

    <ParserWalkthrough />
  </section>
</section>
