<script lang="ts">
import { linkClass, paragraphClass, sectionClass, topSectionClass } from '../classes';
import { prefaceToc } from '../content';
import TableOfContents from './TableOfContents.svelte';
import TitlePage from './TitlePage.svelte';
</script>

<section class={topSectionClass} aria-labelledby="sec-preface">
  <TitlePage id="sec-preface" title="Preface" level={2} />
  <TableOfContents items={prefaceToc} />

  <section class={sectionClass} aria-labelledby="prerequisites">
    <TitlePage id="prerequisites" title="Prerequisites" level={3} />
    <p class={paragraphClass}>You'll need a working Nix installation (standalone or NixOS) and Home Manager. Being comfortable with basic Nix syntax will help, though the examples should get you most of the way there</p>
  </section>

  <section class={sectionClass} aria-labelledby="reporting-issues">
    <TitlePage id="reporting-issues" title="Reporting Issues" level={3} />
    <p class={paragraphClass}>Found a bug? Check the <a class={`link ${linkClass}`} href="https://github.com/4evy/nixcord/issues">issue tracker</a> first to see if we're already working on it</p>
    <p class={paragraphClass}>If it's new, open a ticket with your config, system info, and logs. The more details you give us, the faster we can fix it</p>
  </section>

  <section class={sectionClass} aria-labelledby="contributing">
    <TitlePage id="contributing" title="Contributing" level={3} />
    <p class={paragraphClass}>PRs are always welcome, whether it's for the code or just fixing a typo in the docs</p>
  </section>
</section>
