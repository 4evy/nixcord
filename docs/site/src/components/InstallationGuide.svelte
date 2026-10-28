<script lang="ts">
import { linkClass, literalCodeClass, paragraphClass } from '../classes';
import { darwinExample, flakeExample, homeManagerExample, nixosExample } from '../content';
import CodeBlock from './CodeBlock.svelte';

const setups = [
  {
    id: 'home-manager',
    label: 'Home Manager',
    argument: 'extraSpecialArgs',
    code: homeManagerExample,
    file: 'home.nix',
    command: 'home-manager switch',
  },
  {
    id: 'nixos',
    label: 'NixOS',
    argument: 'specialArgs',
    code: nixosExample,
    file: 'configuration.nix',
    command: 'sudo nixos-rebuild switch',
  },
  {
    id: 'darwin',
    label: 'nix-darwin',
    argument: 'specialArgs',
    code: darwinExample,
    file: 'darwin-configuration.nix',
    command: 'sudo darwin-rebuild switch',
  },
];

let selectedSetup = $state('home-manager');
const setup = $derived(setups.find((item) => item.id === selectedSetup) ?? setups[0]!);
</script>

<p class={paragraphClass}>
  Start with a working Home Manager, NixOS, or nix-darwin configuration. Add Nixcord in three steps.
  <a class={linkClass} href="#without-flakes">Not using flakes?</a>
</p>

<fieldset class="my-6 min-w-0">
  <legend class="mb-2.5 text-sm font-semibold">Choose your setup</legend>
  <div class="flex flex-wrap gap-2">
    {#each setups as item (item.id)}
      <label
        class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm hover:border-accent has-checked:border-accent has-checked:bg-selected has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-accent"
      >
        <input
          class="accent-accent"
          type="radio"
          name="installation-setup"
          value={item.id}
          bind:group={selectedSetup}
        >
        <span>{item.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<ol class="my-7 list-decimal space-y-7 pl-6 marker:font-semibold marker:text-muted">
  <li class="min-w-0 pl-2">
    <h4 class="text-base/6 font-semibold">Add the flake input</h4>
    <p class={paragraphClass}>
      Add Nixcord alongside the inputs in your existing
      <code class={literalCodeClass}>flake.nix</code>.
    </p>
    <CodeBlock code={flakeExample} label="flake.nix" />
  </li>
  <li class="min-w-0 pl-2">
    <h4 class="text-base/6 font-semibold">Import the {setup.label} module</h4>
    <p class={paragraphClass}>
      In your configuration builder, pass <code class={literalCodeClass}>inputs</code>
      to your modules with
      <code class={literalCodeClass}>{`${setup.argument} = { inherit inputs; };`}</code>
    </p>
    {#if selectedSetup === 'home-manager'}
      <p class="my-3 text-sm text-muted">
        Using Home Manager inside NixOS or nix-darwin? Set
        <code>{'home-manager.extraSpecialArgs = { inherit inputs; };'}</code>
        instead. Home Manager uses your configured username and home directory.
      </p>
    {:else}
      <p class="my-3 text-sm text-muted">
        Replace <code>your-username</code> with the existing user whose settings Nixcord should
        manage.
      </p>
    {/if}
    <CodeBlock code={setup.code} label={setup.file} />
  </li>
  <li class="min-w-0 pl-2">
    <h4 class="text-base/6 font-semibold">Apply and reopen Discord</h4>
    <p class={paragraphClass}>
      Apply your configuration with your usual switch command, keeping any flake path or host name
      you normally pass.
    </p>
    <CodeBlock code={setup.command} language="shell" label="Terminal" />
    <p class={paragraphClass}>
      Reopen Discord to load Vencord and the configured plugins. Then
      <a class={linkClass} href="#sec-configuration">add plugins and themes</a>
      or <a class={linkClass} href="#sec-converter">convert your existing settings</a>.
    </p>
  </li>
</ol>
