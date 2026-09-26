import configurationExample from './examples/configuration.nix?raw';
import darwinExample from './examples/darwin.nix?raw';
import flakeExample from './examples/flake.nix?raw';
import goofcordExample from './examples/goofcord.nix?raw';
import homeManagerExample from './examples/home-manager.nix?raw';
import legcordExample from './examples/legcord.nix?raw';
import nixosExample from './examples/nixos.nix?raw';
import userPluginsExample from './examples/user-plugins.nix?raw';

declare const __NIXCORD_REVISION__: string;

export const revision = __NIXCORD_REVISION__;

export const mainToc = [
  { href: '#sec-options', label: 'Option reference' },
  { href: '#sec-converter', label: 'Convert settings' },
  { href: '#sec-preface', label: 'Before you start' },
  { href: '#sec-introduction', label: 'Setup and configuration' },
];

export const prefaceToc = [
  { href: '#prerequisites', label: 'Prerequisites' },
  { href: '#reporting-issues', label: 'Report a problem' },
  { href: '#contributing', label: 'Contribute' },
];

export const introductionToc = [
  { href: '#getting-started', label: 'Install Nixcord' },
  { href: '#without-flakes', label: 'Without flakes' },
  { href: '#sec-configuration', label: 'Plugins and themes' },
  { href: '#sec-legcord', label: 'Legcord' },
  { href: '#sec-goofcord', label: 'GoofCord' },
  { href: '#sec-user-plugins', label: 'Custom plugins' },
  { href: '#sec-dorion', label: 'Dorion setup' },
];

export {
  configurationExample,
  darwinExample,
  flakeExample,
  goofcordExample,
  homeManagerExample,
  legcordExample,
  nixosExample,
  userPluginsExample,
};
