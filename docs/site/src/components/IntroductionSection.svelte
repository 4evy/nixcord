<script lang="ts">
import {
  linkClass,
  literalCodeClass,
  paragraphClass,
  sectionClass,
  topSectionClass,
} from '../classes';
import {
  browserExample,
  configurationExample,
  goofcordExample,
  introductionToc,
  legcordExample,
  userPluginsExample,
} from '../content';
import CodeBlock from './CodeBlock.svelte';
import InstallationGuide from './InstallationGuide.svelte';
import TableOfContents from './TableOfContents.svelte';
import TitlePage from './TitlePage.svelte';
</script>

<section class={`${topSectionClass} max-w-[72ch]`} aria-labelledby="sec-introduction">
  <TitlePage id="sec-introduction" title="Setup and configuration" level={2} />
  <TableOfContents items={introductionToc} />

  <p class={paragraphClass}>
    Nixcord supports Discord with Vencord or Equicord, plus Vesktop, Equibop, GoofCord, Legcord, and
    Dorion. You can also configure Vencord or Equicord browser extensions. Choose a client below,
    then add plugins and themes.
  </p>
  <aside
    class="my-4 rounded-r-sm border-l-4 border-[#167cb9] bg-sky-50 px-4 py-3 text-neutral-900 dark:bg-[#142633] dark:text-neutral-100"
    aria-label="Managed settings"
  >
    <p class="m-0 max-w-[72ch]">
      Keep plugin settings in your <code class={literalCodeClass}>.nix</code> file. Changes in the
      client's Plugins menu may be blocked or replaced when you apply your configuration.
    </p>
  </aside>

  <section class={sectionClass} aria-labelledby="getting-started">
    <TitlePage id="getting-started" title="Install Nixcord" level={3} />
    <InstallationGuide />
  </section>

  <section class={sectionClass} aria-labelledby="without-flakes">
    <TitlePage id="without-flakes" title="Without flakes" level={3} />
    <p class={paragraphClass}>
      Pin Nixcord with npins or another source pinning tool, then import its
      <code class={literalCodeClass}>default.nix</code>. The import provides the same Home Manager,
      NixOS, and nix-darwin modules. Follow the
      <a class={`${linkClass}`} href="https://github.com/4evy/nixcord#without-flakes"
        >non-flake setup instructions</a
      >
      for commands and examples.
    </p>
  </section>

  <section class={sectionClass} aria-labelledby="sec-configuration">
    <TitlePage id="sec-configuration" title="Plugins and themes" level={3} />
    <p class={paragraphClass}>
      Discord is enabled by default. Choose either Vencord or Equicord for it. To use another client
      alone, set <code class={literalCodeClass}>discord.enable = false</code> and enable that
      client. Vesktop uses Vencord; Equibop uses Equicord. The example below installs both Discord
      with Vencord and Vesktop.
    </p>
    <aside
      class="my-4 rounded-r-sm border-l-4 border-[#268598] bg-sky-50 px-4 py-3 text-neutral-900 dark:bg-[#142633] dark:text-neutral-100"
      aria-label="Tip"
    >
      <p class="m-0 max-w-[72ch]">
        Find plugin names and settings in the
        <a class={`${linkClass}`} href="#sec-options">option reference</a>. Use the Nix option name
        shown there; it may differ from the name in the client.
      </p>
    </aside>
    <CodeBlock code={configurationExample} />
    <p class={paragraphClass}>
      <code class={literalCodeClass}>config</code>
      supplies shared mod settings. Put options missing from the reference in
      <code class={literalCodeClass}>extraConfig</code>. Client-specific settings, such as
      <code class={literalCodeClass}>vesktopConfig</code>, override shared values for that client.
      Native client preferences, such as tray behavior, belong in
      <code class={literalCodeClass}>vesktop.settings</code>
      or the equivalent client option.
    </p>
    <p class={paragraphClass}>
      Quick CSS needs both <code class={literalCodeClass}>quickCss</code> and
      <code class={literalCodeClass}>config.useQuickCss = true</code>. Add online themes with
      <code class={literalCodeClass}>config.themeLinks</code>. For a local theme, set
      <code class={literalCodeClass}>config.themes.myTheme = ./my-theme.css</code>
      and add
      <code class={literalCodeClass}>"myTheme.css"</code>
      to
      <code class={literalCodeClass}>config.enabledThemes</code>.
    </p>
    <p class={paragraphClass}>
      To install multiple Discord branches, set
      <code class={literalCodeClass}>discord.branches = [ "stable" "ptb" "canary" ]</code>. The
      branches share your mod settings and package options.
      <code class={literalCodeClass}>"development"</code>
      is also accepted.
    </p>
  </section>

  <section class={sectionClass} aria-labelledby="sec-browser">
    <TitlePage id="sec-browser" title="Browser extensions" level={3} />
    <p class={paragraphClass}>
      Build a Chromium extension directly from your Nixcord configuration. Nixcord
      bundles your settings, Quick CSS, themes, and custom plugins, with no
      separate settings file to write or import. First
      <a class={linkClass} href="#getting-started">import the Nixcord module</a>,
      then use this browser-only configuration:
    </p>
    <CodeBlock code={browserExample} />
    <p class={paragraphClass}>
      Set <code class={literalCodeClass}>browser.client = "equicord"</code> for
      Equicord. Keep <code class={literalCodeClass}>discord.enable = false</code>
      to avoid installing desktop Discord. Browser settings come from
      <code class={literalCodeClass}>config</code> and
      <code class={literalCodeClass}>extraConfig</code>, with
      <a class={linkClass} href="#opt-programs.nixcord.browser.extraConfig">
        <code class={literalCodeClass}>browser.extraConfig</code></a
      > overriding them for the browser only. Native client overrides, such as
      <code class={literalCodeClass}>vesktopConfig</code>, are not included.
    </p>

    <h4 class="mt-6 text-base/6 font-semibold">Load a configured Chromium extension</h4>
    <ol class="my-3 ml-8 list-decimal">
      <li class="my-1">
        Build
        <a class={linkClass} href="#opt-programs.nixcord.browser.finalPackage">
          <code class={literalCodeClass}>
            config.programs.nixcord.browser.finalPackage</code
          ></a
        > from your evaluated configuration.
      </li>
      <li class="my-1">
        Open your browser's extensions page
        (<code class={literalCodeClass}>chrome://extensions</code> in Chromium).
        Disable other copies of Vencord or Equicord and enable
        <strong>Developer mode</strong>.
      </li>
      <li class="my-1">
        Choose <strong>Load unpacked</strong>, select the package's Nix store
        directory, and reload Discord.
      </li>
    </ol>
    <p class={paragraphClass}>
      The extension bundles settings, Quick CSS, local themes, and
      <a class={linkClass} href="#sec-user-plugins">custom plugins</a>. Declared
      settings override stored values on page load, preserving undeclared
      settings. Chromium keeps network rules in the browser profile, so the
      extension can stay in the read-only Nix store. After rebuilding, load the
      new store path and reload Discord.
    </p>

    <h4 class="mt-6 text-base/6 font-semibold">Optional: import into an existing extension</h4>
    <p class={paragraphClass}>
      Already using an extension installed elsewhere? Export a settings backup
      instead. This is an alternative to the generated extension above, not an
      extra step it requires.
    </p>
    <ol class="my-3 ml-8 list-decimal">
      <li class="my-1">
        Apply your Nix configuration and find the generated JSON file at
        <a class={linkClass} href="#opt-programs.nixcord.browser.settingsFile">
          <code class={literalCodeClass}>
            config.programs.nixcord.browser.settingsFile</code
          ></a
        > in your evaluated configuration.
      </li>
      <li class="my-1">
        Back up your current mod settings. In Discord's mod settings, open
        <strong>Backup &amp; Restore</strong> and import that file
        (Equicord: <strong>Import All Settings</strong>).
      </li>
      <li class="my-1">
        Reload Discord. Re-import the backup after changing your Nix
        configuration.
      </li>
    </ol>
    <p class={paragraphClass}>
      This generates a backup without building or installing an extension or
      changing your browser profile. It includes settings, Quick CSS, and online
      theme settings, but not local theme files or custom plugin code. Vencord
      replaces imported settings and Quick CSS, including clearing CSS when the
      backup's CSS is empty. Equicord merges settings and ignores empty CSS.
    </p>
  </section>

  <section class={sectionClass} aria-labelledby="sec-legcord">
    <TitlePage id="sec-legcord" title="Legcord" level={3} />
    <p class={paragraphClass}>
      <a class={`${linkClass}`} href="https://github.com/Legcord/Legcord">Legcord</a>
      can bundle Vencord or Equicord, including your custom plugins. This example selects Vencord
      and minimizes Legcord to the tray. Use
      <code class={literalCodeClass}>legcord.equicord.enable</code>
      instead to select Equicord.
    </p>
    <CodeBlock code={legcordExample} />
  </section>

  <section class={sectionClass} aria-labelledby="sec-goofcord">
    <TitlePage id="sec-goofcord" title="GoofCord" level={3} />
    <p class={paragraphClass}>
      <a class={`${linkClass}`} href="https://github.com/Milkshiift/GoofCord">GoofCord</a>
      uses Vencord by default. Set
      <code class={literalCodeClass}>goofcord.clientMod = "equicord"</code>
      to use Equicord. Nixcord bundles the selected mod and applies your plugin settings:
    </p>
    <CodeBlock code={goofcordExample} />
    <aside
      class="my-4 rounded-r-sm border-l-4 border-neutral-400 bg-neutral-50 px-4 py-3 text-neutral-900 dark:border-neutral-500 dark:bg-[#171d24] dark:text-neutral-100"
      aria-label="GoofCord platform note"
    >
      <p class="m-0 max-w-[72ch]">
        Nixcord extends the nixpkgs GoofCord package with Apple silicon macOS support.
      </p>
    </aside>
  </section>

  <section class={sectionClass} aria-labelledby="sec-user-plugins">
    <TitlePage id="sec-user-plugins" title="Custom plugins" level={3} />
    <p class={paragraphClass}>
      Add plugin source code to the mod build with
      <code class={literalCodeClass}>userPlugins</code>. Then enable it by its declared plugin name
      in <code class={literalCodeClass}>extraConfig.plugins</code>:
    </p>
    <CodeBlock code={userPluginsExample} />
    <p class={paragraphClass}>
      Replace each placeholder revision with a full 40-character commit hash. Branches and tags are
      not accepted. The forge shorthands support GitHub, GitLab, Codeberg, SourceHut, and Bitbucket;
      use a <code class={literalCodeClass}>git+</code> URL for other hosts. Absolute path strings
      require <code class={literalCodeClass}>--impure</code> with flakes. Nix path literals and
      derivations are also accepted.
    </p>
  </section>

  <section class={sectionClass} aria-labelledby="sec-dorion">
    <TitlePage id="sec-dorion" title="Dorion setup" level={3} />
    <p class={paragraphClass}>
      Load Discord in Dorion once before enabling the module. That first launch creates the WebKit
      storage where Nixcord writes Vencord settings.
    </p>
    <ol class="my-3 ml-8 list-decimal">
      <li class="my-1">
        <p class={paragraphClass}>
          Run Dorion once before enabling Nixcord's Dorion module:
          <code class={literalCodeClass}>nix run nixpkgs#dorion</code>
        </p>
      </li>
      <li class="my-1">
        <p class={paragraphClass}>Log in, wait for Discord to finish loading, then close Dorion.</p>
      </li>
      <li class="my-1">
        <p class={paragraphClass}>
          Set <code class={literalCodeClass}>programs.nixcord.enable = true</code> and
          <code class={literalCodeClass}>programs.nixcord.dorion.enable = true</code>, then apply
          your configuration. Disable
          <code class={literalCodeClass}>programs.nixcord.discord.enable</code>
          if you only want Dorion.
        </p>
      </li>
    </ol>
    <aside
      class="my-4 rounded-r-sm border-l-4 border-neutral-400 bg-neutral-50 px-4 py-3 text-neutral-900 dark:border-neutral-500 dark:bg-[#171d24] dark:text-neutral-100"
      aria-label="Dorion compatibility note"
    >
      <p class="m-0 max-w-[72ch]">
        Linux voice and video depend on Dorion's WebKitGTK support and may fail even when Nixcord is
        configured. Check
        <a class={`${linkClass}`} href="https://github.com/SpikeHD/Dorion"
          >Dorion's compatibility notes</a
        >
        before choosing it for calls.
      </p>
    </aside>
  </section>
</section>
