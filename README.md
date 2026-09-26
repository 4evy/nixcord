<div align="center">

<img src="https://4evy.github.io/nixcord/nixcord-logo.svg" alt="Nixcord" width="240">

# Nixcord

Configure Discord clients, plugins, and themes with Nix.

Nixcord provides Home Manager, NixOS, and nix-darwin modules for Discord with
Vencord or Equicord, plus Vesktop, Equibop, GoofCord, Legcord, and Dorion.

[![Flake Checks](https://github.com/4evy/nixcord/actions/workflows/check.yaml/badge.svg?branch=main)](https://github.com/4evy/nixcord/actions/workflows/check.yaml)
[![Docs](https://github.com/4evy/nixcord/actions/workflows/github-pages.yaml/badge.svg?branch=main)](https://github.com/4evy/nixcord/actions/workflows/github-pages.yaml)
[![MIT License](https://img.shields.io/github/license/4evy/nixcord?style=flat-square)](https://github.com/4evy/nixcord/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/4evy/nixcord?style=flat-square&logo=github)](https://github.com/4evy/nixcord/stargazers)
[![Built with Nix](https://img.shields.io/badge/built%20with-Nix-5277C3?style=flat-square&logo=nixos&logoColor=white)](https://nixos.org/)

[Get started](#quickstart) · [Without flakes](#without-flakes) ·
[Configuration](#configuration) · [Manual and options](https://4evy.github.io/nixcord/)

</div>

## Quickstart

Start with an existing Home Manager, NixOS, or nix-darwin configuration.
Add this input to its `flake.nix`:

```nix
inputs.nixcord.url = "github:4evy/nixcord";
```

Pass `inputs` to your configuration modules: use
`extraSpecialArgs = { inherit inputs; };` in `homeManagerConfiguration`, or
`specialArgs = { inherit inputs; };` in `nixosSystem` or `darwinSystem`.
For Home Manager inside a system configuration, use
`home-manager.extraSpecialArgs = { inherit inputs; };`.

Then import **one** Nixcord module. Home Manager manages the current user's
files and permissions; the system modules require a target username.

### Home Manager

Add this to `home.nix`:

```nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.homeModules.nixcord ];

  programs.nixcord = {
    enable = true;
    discord.vencord.enable = true;
    config.plugins.hideMedia.enable = true;
  };
}
```

### NixOS

Add this to your system configuration, replacing `your-username` with an
existing user:

```nix
{ inputs, ... }:
{
  imports = [ inputs.nixcord.nixosModules.nixcord ];

  programs.nixcord = {
    enable = true;
    user = "your-username";
    discord.vencord.enable = true;
    config.plugins.hideMedia.enable = true;
  };
}
```

### nix-darwin

Use the same configuration as the NixOS example, with this import:

```nix
imports = [ inputs.nixcord.darwinModules.nixcord ];
```

Apply the configuration with your usual `home-manager switch`,
`nixos-rebuild switch`, or `darwin-rebuild switch` command, then reopen Discord.
The example installs Discord with Vencord and enables HideMedia.

Keep plugin settings in Nix. Changes made in the client's Plugins menu may be
blocked or replaced when you apply your configuration.

## Without flakes

From your Nix configuration directory, pin Nixcord and Nixpkgs with
[npins](https://github.com/andir/npins):

```sh
nix-shell -p npins --run 'npins init --bare'
nix-shell -p npins --run 'npins add github NixOS nixpkgs --branch nixos-26.05 --name nixpkgs'
nix-shell -p npins --run 'npins add github 4evy nixcord --branch main'
```

Skip initialization if you already use npins, and skip any pin you already
have. Import the pinned source in your Home Manager configuration:

```nix
let
  sources = import ./npins;
  nixcord = import sources.nixcord { nixpkgs = sources.nixpkgs; };
in
{
  imports = [ nixcord.homeModules.nixcord ];

  programs.nixcord = {
    enable = true;
    discord.vencord.enable = true;
  };
}
```

For a system module, import `nixcord.nixosModules.nixcord` or
`nixcord.darwinModules.nixcord` and set `programs.nixcord.user`.
Apply your configuration as usual. Commit the generated `npins` files to keep
these versions reproducible. To update them:

```sh
nix-shell -p npins --run 'npins update nixpkgs nixcord'
```

Review the pin changes before committing them.

<details>
<summary>Other sources and standalone packages</summary>

`default.nix` accepts a Nixcord source from channels, `fetchTarball`, or another
pinning tool. It does not require flakes or read `flake.lock`.

Pass `nixpkgs` to select the source used for standalone packages, or `pkgs` to
reuse a package set with its overlays and configuration:

```nix
nixcord = import path-to-nixcord { inherit pkgs; };
```

When calculating a module's `imports`, use a source or package set defined
outside the module. The module's own `pkgs` argument is resolved too late for
this. For example, with [Nixtamal](https://nixtamal.toast.al/):

```nix
{ nixtamal, ... }:
let
  nixcord = import nixtamal.nixcord { nixpkgs = nixtamal.nixpkgs; };
in
{
  imports = [ nixcord.homeModules.nixcord ];
}
```

Passing `nixpkgs` creates a separate package set for `nixcord.packages`; it does
not inherit the host's overlays. Passing `{}` uses Nixcord's bundled Nixpkgs
pin. By default, Nixcord modules build with the host's package set.

The import exposes `homeModules`, `nixosModules`, `darwinModules`, `packages`,
`overlay`, and `overlays.default`. The overlay adds packages under
`pkgs.nixcord`:

```nix
(pkgs.extend nixcord.overlay).nixcord.vencord
```

From a Nixcord checkout, you can also run `nix-build -A vencord`,
`nix-build -A goofcord`, `nix-build -A docs`, or `nix-shell`.

</details>

## Configuration

All examples below go under `programs.nixcord` in an imported Nixcord module.
Keep `programs.nixcord.enable = true` and, for a system module, set `user`.

### Choose a client

Discord is enabled by default. Choose either `discord.vencord.enable = true`
or `discord.equicord.enable = true`; you cannot enable both.

To use Vesktop instead of Discord:

```nix
programs.nixcord = {
  enable = true;
  discord.enable = false;
  vesktop.enable = true;
};
```

Equibop uses Equicord; enable it with `equibop.enable = true`. You can enable
multiple clients. Leave `discord.enable` on if you also want Discord installed.

### Set plugins and themes

Use `config.plugins` for options in the
[reference](https://4evy.github.io/nixcord/#sec-options). Plugin option names
can differ from their names in the client, so copy the Nix name from the
reference.

```nix
programs.nixcord = {
  config.plugins = {
    hideMedia.enable = true;
    ignoreActivities = {
      enable = true;
      ignorePlaying = true;
    };
  };

  quickCss = "body { --font-primary: monospace; }";
  config.useQuickCss = true;
};
```

Add online theme URLs with `config.themeLinks`. For local themes, define
`config.themes.myTheme = ./my-theme.css` and enable `"myTheme.css"` in
`config.enabledThemes`.

`config` supplies shared mod settings. Use `extraConfig` for settings missing
from the reference, including custom plugins. Client-specific settings such
as `vesktopConfig` override shared values for that client. Native client
preferences belong in options such as `vesktop.settings` or `goofcord.settings`.

### Multiple Discord branches

Install Stable, PTB, Canary, or Development together:

```nix
programs.nixcord.discord = {
  branches = [ "stable" "ptb" "canary" ];
  equicord.enable = true;
  krisp.enable = true;
};
```

Replace the quickstart's Vencord selection with Equicord for this example.
Every selected branch uses the same mod configuration and package options,
including Krisp and OpenASAR. `finalPackage.discord` is the first branch;
`finalPackage.discordBranches` contains all packages by branch name.

## Settings converter

Paste an exported Vencord or Equicord settings backup into the
[settings converter](https://4evy.github.io/nixcord/#sec-converter). It also
accepts raw settings JSON or a plugins object. Conversion runs in your browser.
Review the result, merge it into `programs.nixcord`, and apply your
configuration.

## Legcord

Bundle Vencord with Legcord and configure its tray behavior:

```nix
programs.nixcord = {
  enable = true;
  discord.enable = false;
  legcord = {
    enable = true;
    vencord.enable = true;
    settings = {
      channel = "stable";
      tray = "dynamic";
      minimizeToTray = true;
      doneSetup = true;
    };
  };
};
```

Use `legcord.equicord.enable` instead for Equicord. Both bundles include
`userPlugins` and use the shared mod settings.

## GoofCord

GoofCord uses Vencord by default. To use Equicord:

```nix
programs.nixcord = {
  enable = true;
  discord.enable = false;
  goofcord = {
    enable = true;
    clientMod = "equicord";
    settings = {
      minimizeToTray = true;
      hardwareAcceleration = true;
    };
  };
};
```

Nixcord bundles the selected mod and applies your plugin settings. It also
adds Apple silicon macOS support to the Nixpkgs GoofCord package.

## Third-party user plugins

`userPlugins` adds plugin source code to the mod build. Enable each plugin
separately in `extraConfig.plugins`, using the name declared by the plugin.
For a local plugin:

```nix
programs.nixcord = {
  userPlugins.myPlugin = ./plugins/myPlugin;
  extraConfig.plugins.MyPlugin.enable = true;
};
```

Replace `MyPlugin` with your plugin's declared name. Remote sources accept
`github:owner/repo/COMMIT`, `gitlab:`, `codeberg:`, `sourcehut:`,
and `bitbucket:` shorthands, or `git+https://forge.example/owner/repo.git?rev=COMMIT`.
Replace `COMMIT` with a full 40-character commit hash; branches and tags are
not accepted. An absolute path string such as `"/home/user/projects/myPlugin"`
requires `--impure` when used with flakes. Nix path literals and derivations
are also accepted.

## Dorion

Dorion must load Discord once before Nixcord can apply its Vencord settings.
That first launch creates the WebKit storage used by the mod.

1. Before enabling the Dorion module, run `nix run nixpkgs#dorion`.
2. Log in, wait for Discord to load, then close Dorion.
3. Set `programs.nixcord.enable = true` and
   `programs.nixcord.dorion.enable = true`, then apply your configuration.
   Set `programs.nixcord.discord.enable = false` if you only want Dorion.

Linux voice and video depend on Dorion's WebKitGTK support and may fail even
when Nixcord is configured. Check
[Dorion's compatibility notes](https://github.com/SpikeHD/Dorion) before choosing
it for calls.

## Build the docs

- `nix build .#docs` builds the site.
- `nix build .#docs-json` builds the option reference as JSON.
- `npm run docs:dev:options` generates options and starts the local docs server.

Vencord and Equicord modify Discord in ways that violate its terms of service.
See the [Vencord FAQ](https://vencord.dev/support/) before using them.
