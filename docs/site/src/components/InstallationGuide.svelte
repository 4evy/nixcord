<script lang="ts">
import { literalCodeClass, paragraphClass } from '../classes';
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
  Start with a working Home Manager, NixOS, or nix-darwin configuration.
  Add Nixcord in three steps. <a class="setup-text-link" href="#without-flakes">Not using flakes?</a>
</p>

<fieldset class="setup-picker">
  <legend>Choose your setup</legend>
  <div class="setup-choices">
    {#each setups as item (item.id)}
      <label class="setup-choice">
        <input type="radio" name="installation-setup" value={item.id} bind:group={selectedSetup} />
        <span>{item.label}</span>
      </label>
    {/each}
  </div>
</fieldset>

<ol class="installation-steps">
  <li>
    <h4>Add the flake input</h4>
    <p class={paragraphClass}>
      Add Nixcord alongside the inputs in your existing
      <code class={literalCodeClass}>flake.nix</code>.
    </p>
    <CodeBlock code={flakeExample} label="flake.nix" />
  </li>
  <li>
    <h4>Import the {setup.label} module</h4>
    <p class={paragraphClass}>
      In your configuration builder, pass <code class={literalCodeClass}>inputs</code>
      to your modules with
      <code class={literalCodeClass}>{`${setup.argument} = { inherit inputs; };`}</code>
    </p>
    {#if selectedSetup === 'home-manager'}
      <p class="setup-note">
        Using Home Manager inside NixOS or nix-darwin? Set
        <code>{'home-manager.extraSpecialArgs = { inherit inputs; };'}</code> instead.
        Home Manager uses your configured username and home directory.
      </p>
    {:else}
      <p class="setup-note">
        Replace <code>your-username</code> with the existing user whose settings
        Nixcord should manage.
      </p>
    {/if}
    <CodeBlock code={setup.code} label={setup.file} />
  </li>
  <li>
    <h4>Apply and reopen Discord</h4>
    <p class={paragraphClass}>
      Apply your configuration with your usual switch command, keeping any
      flake path or host name you normally pass.
    </p>
    <CodeBlock code={setup.command} language="shell" label="Terminal" />
    <p class={paragraphClass}>
      Reopen Discord to load Vencord and the configured plugins. Then
      <a class="setup-text-link" href="#sec-configuration">add plugins and themes</a>
      or <a class="setup-text-link" href="#sec-converter">convert your existing settings</a>.
    </p>
  </li>
</ol>
