<script lang="ts">
import { linkClass, literalCodeClass, paragraphClass, sectionClass, topSectionClass } from '../classes';
import {
  configurationExample,
  darwinExample,
  flakeExample,
  homeManagerExample,
  introductionToc,
  legcordExample,
  nixosExample,
  userPluginsExample,
} from '../content';
import CodeBlock from './CodeBlock.svelte';
import TableOfContents from './TableOfContents.svelte';
import TitlePage from './TitlePage.svelte';
</script>

<section class={topSectionClass} aria-labelledby="sec-introduction">
  <TitlePage id="sec-introduction" title="Introduction" level={2} />
  <TableOfContents items={introductionToc} />

  <p class={paragraphClass}>Nixcord lets you manage <a class={`link ${linkClass}`} href="https://github.com/Vendicated/Vencord">Vencord</a>, <a class={`link ${linkClass}`} href="https://github.com/Equicord/Equicord">Equicord</a>, and clients like <a class={`link ${linkClass}`} href="https://github.com/Vencord/Vesktop">Vesktop</a>, <a class={`link ${linkClass}`} href="https://github.com/SpikeHD/Dorion">Dorion</a>, and <a class={`link ${linkClass}`} href="https://github.com/Legcord/Legcord">Legcord</a> declaratively</p>
  <p class={paragraphClass}>Instead of configuring your plugins via the UI (and losing them when you reinstall), you define everything in Nix. It handles patching the client, injecting the config, and keeping your setup reproducible</p>

  <blockquote class="my-4 rounded-r-sm border-l-4 border-[#167cb9] bg-sky-50 px-4 py-3 text-neutral-900">
    <p class="m-0 max-w-[72ch]"><strong>Heads up:</strong> Since this is declarative, the in-app "Plugins" menu won't save changes permanently. You have to update your <code class={literalCodeClass}>.nix</code> file to make settings stick</p>
  </blockquote>

  <p class={paragraphClass}>It supports:</p>
  <ul class="my-3 ml-8 list-disc">
    <li class="my-1"><p class={paragraphClass}><strong>Standard Discord</strong> (Stable, PTB, Canary, Dev), with Vencord or Equicord</p></li>
    <li class="my-1"><p class={paragraphClass}><strong>Vesktop</strong> &amp; <strong>Equibop</strong></p></li>
    <li class="my-1"><p class={paragraphClass}><strong>Dorion</strong></p></li>
    <li class="my-1"><p class={paragraphClass}><strong>Legcord</strong></p></li>
  </ul>

  <section class={sectionClass} aria-labelledby="getting-started">
    <TitlePage id="getting-started" title="Getting Started" level={3} />
    <p class={paragraphClass}>Add Nixcord to your <code class={literalCodeClass}>flake.nix</code> inputs:</p>
    <CodeBlock code={flakeExample} />
    <p class={paragraphClass}>Then import the module:</p>
    <p class={paragraphClass}><strong>Home Manager (Recommended)</strong></p>
    <CodeBlock code={homeManagerExample} />
    <p class={paragraphClass}><strong>NixOS (System-wide)</strong></p>
    <CodeBlock code={nixosExample} />
    <p class={paragraphClass}><strong>nix-darwin (macOS)</strong></p>
    <CodeBlock code={darwinExample} />
  </section>

  <section class={sectionClass} aria-labelledby="sec-configuration">
    <TitlePage id="sec-configuration" title="Configuration" level={3} />
    <p class={paragraphClass}>Enable your client and configure plugins:</p>
    <p class={paragraphClass}><strong>Tip:</strong> Launch your client once manually to look through the plugins list so you know what you actually want to enable</p>
    <CodeBlock code={configurationExample} />
  </section>

  <section class={sectionClass} aria-labelledby="sec-legcord">
    <TitlePage id="sec-legcord" title="Legcord" level={3} />
    <p class={paragraphClass}><a class={`link ${linkClass}`} href="https://github.com/Legcord/Legcord">Legcord</a> is a lightweight Discord client. Enable it with:</p>
    <CodeBlock code={legcordExample} />
  </section>

  <section class={sectionClass} aria-labelledby="sec-user-plugins">
    <TitlePage id="sec-user-plugins" title="Third-Party User Plugins" level={3} />
    <p class={paragraphClass}>You can load custom Vencord/Equicord plugins that aren't in the upstream plugin list using <code class={literalCodeClass}>userPlugins</code>. Any plugin you add also needs to be enabled in <code class={literalCodeClass}>extraConfig.plugins</code>:</p>
    <CodeBlock code={userPluginsExample} />
  </section>

  <section class={sectionClass} aria-labelledby="sec-dorion">
    <TitlePage id="sec-dorion" title="A Note on Dorion" level={3} />
    <p class={paragraphClass}>Dorion needs <code class={literalCodeClass}>LocalStorage</code> databases that only exist after a successful launch. If you just enable it in Nix immediately, it won't work</p>
    <ol class="my-3 ml-8 list-decimal">
      <li class="my-1"><p class={paragraphClass}>Run it once temporarily: <code class={literalCodeClass}>nix run github:FlameFlag/nixcord#dorion</code></p></li>
      <li class="my-1"><p class={paragraphClass}>Log in and close it</p></li>
      <li class="my-1"><p class={paragraphClass}>Enable <code class={literalCodeClass}>dorion.enable = true</code> in your config and rebuild</p></li>
    </ol>
    <p class={paragraphClass}><em>Dorion uses WebKitGTK, so voice/video might fail with "Unsupported Browser" errors. Can't fix that on our end</em></p>
  </section>
</section>
