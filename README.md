<div align="center">

<img src="https://repository-images.githubusercontent.com/818567152/b2e5b9af-ce34-430e-a2ec-e98e0d3470d8" alt="Nixcord" width="240">

# Nixcord

**One Nix config for your Discord mods, themes, and clients.**

Manage [Vencord](https://github.com/Vendicated/Vencord),
[Equicord](https://github.com/Equicord/Equicord),
[Vesktop](https://github.com/Vencord/Vesktop),
[GoofCord](https://github.com/Milkshiift/GoofCord),
[Dorion](https://github.com/SpikeHD/Dorion), and
[Legcord](https://github.com/Legcord/Legcord) from your Nix config.

[![Flake Checks](https://github.com/4evy/nixcord/actions/workflows/check.yaml/badge.svg?branch=main)](https://github.com/4evy/nixcord/actions/workflows/check.yaml)
[![Docs](https://github.com/4evy/nixcord/actions/workflows/github-pages.yaml/badge.svg?branch=main)](https://github.com/4evy/nixcord/actions/workflows/github-pages.yaml)
[![MIT License](https://img.shields.io/github/license/4evy/nixcord?style=flat-square)](https://github.com/4evy/nixcord/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/4evy/nixcord?style=flat-square&logo=github)](https://github.com/4evy/nixcord/stargazers)
[![Built with Nix](https://img.shields.io/badge/built%20with-Nix-5277C3?style=flat-square&logo=nixos&logoColor=white)](https://nixos.org/)

[Quickstart](#quickstart) | [Without flakes](#without-flakes) | [Configuration](#configuration) |
[Settings converter](#settings-converter) | [Options](https://4evy.github.io/nixcord/) |
[User plugins](#third-party-user-plugins)

</div>

<!-- prettier-ignore -->
> [!IMPORTANT]
> Configure plugins in your `.nix` file. Changes made in the client's
> **Plugins** menu do not persist.

## Quickstart

Add Nixcord to your `flake.nix` inputs:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    nixcord.url = "github:4evy/nixcord";
    # ...
  };

  # ...
}
```

Import the module for your setup. Pass `inputs` through `extraSpecialArgs` for
Home Manager or `specialArgs` for NixOS and nix-darwin.

### Home Manager (recommended)

Home Manager handles paths and permissions for your user.

```nix
# home.nix
{ inputs, ... }: {
  imports = [ inputs.nixcord.homeModules.nixcord ];
  # ... config
}
```

### NixOS

For system-wide configuration, specify the user whose settings you want to
manage:

```nix
# configuration.nix
{ inputs, ... }: {
  imports = [ inputs.nixcord.nixosModules.nixcord ];

  programs.nixcord = {
    enable = true;
    user = "your-username"; # Needed for system-level config
    # ... config
  };
}
```

### nix-darwin (macOS)

For system-wide configuration on macOS, specify the user:

```nix
# darwin-configuration.nix
{ inputs, ... }: {
  imports = [ inputs.nixcord.darwinModules.nixcord ];

  programs.nixcord = {
    enable = true;
    user = "your-username"; # Needed for system-level config
    # ... config
  };
}
```

## Without flakes

Use [npins](https://github.com/andir/npins) to pin Nixpkgs and Nixcord. From
your Nix configuration directory, run:

```sh
nix-shell -p npins --run 'npins init --bare'
nix-shell -p npins --run 'npins add github NixOS nixpkgs --branch nixos-26.05 --name nixpkgs'
nix-shell -p npins --run 'npins add github 4evy nixcord --branch main'
```

Skip initialization if you already use npins. Commit the generated `npins`
files. Then import Nixcord in your Home Manager configuration:

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

For NixOS or nix-darwin, use `nixcord.nixosModules.nixcord` or
`nixcord.darwinModules.nixcord` and set `programs.nixcord.user`, as shown above.

To update, run the following command, then review and commit the pin changes:

```sh
nix-shell -p npins --run 'npins update nixpkgs nixcord'
```

<details>

<summary>Other sources, package sets, and standalone builds</summary>

Nixcord's `default.nix` also accepts sources from channels, `fetchTarball`, or
other pinning tools. It does not enable flakes or read `flake.lock`.

Pass `nixpkgs` to select the source for standalone package outputs, or `pkgs` to
reuse an existing package set with its configuration and overlays:

```nix
nixcord = import path-to-nixcord { inherit pkgs; };
```

Do not use a module's `pkgs` argument to calculate its `imports`: that argument
is resolved after imports are collected. Use a package set defined outside the
module or a pinned source passed through `extraSpecialArgs`. For example, with
[Nixtamal](https://nixtamal.toast.al/):

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
not inherit Home Manager's overlays or package configuration. Passing `{}` uses
Nixcord's bundled Nixpkgs pin. Nixcord modules use the host's package set.

The import exposes `homeModules`, `nixosModules`, `darwinModules`, `packages`,
`overlay`, and `overlays.default`. The overlay adds packages under
`pkgs.nixcord`:

```nix
(pkgs.extend nixcord.overlay).nixcord.vencord
```

You can also build packages or open a development shell from a Nixcord checkout:

```sh
nix-build -A vencord
nix-build -A goofcord
nix-build -A docs
nix-shell
```

</details>

## Configuration

Enable your client, then choose plugins and themes. Open the client to browse
available plugins before adding them to your configuration:

```nix
{
  programs.nixcord = {
    enable = true;

    # Enable either Vencord or Equicord for Discord
    discord.vencord.enable = true;      # Standard Vencord
    # discord.equicord.enable = true;   # Equicord (has more plugins)

    # Additional clients
    vesktop.enable = true;
    # goofcord.enable = true;
    # dorion.enable = true;
    # legcord.enable = true;

    # Theming
    quickCss = "/* css goes here */";
    config = {
      useQuickCss = true;
      themeLinks = [
        "https://raw.githubusercontent.com/link/to/some/theme.css"
      ];
      frameless = true;

      plugins = {
        hideMedia.enable = true;
        ignoreActivities = {
          enable = true;
          ignorePlaying = true;
          ignoredActivities = [
            { id = "game-id"; name = "League of Legends"; type = 0; }
          ];
        };
      };
    };
  };
}
```

See the [options reference](https://4evy.github.io/nixcord/) for all settings.

### Multiple Discord branches

Stable, PTB, Canary, and Development can be installed at the same time. Every
selected branch uses the same Vencord or Equicord configuration and Discord
package options, including Krisp and OpenASAR:

```nix
programs.nixcord = {
  enable = true;
  discord = {
    branches = [ "stable" "ptb" "canary" ];
    equicord.enable = true;
    krisp.enable = true;
  };
};
```

The first configured branch is exposed through `finalPackage.discord`; all
resulting packages are available by branch through
`finalPackage.discordBranches`.

## Settings converter

Convert an exported Vencord or Equicord `settings.json` to Nix with the
[settings converter](https://4evy.github.io/nixcord/#sec-converter). Conversion
runs in your browser.

## Legcord

[Legcord](https://github.com/Legcord/Legcord) is a lightweight Discord client.
Enable it with:

```nix
{
  programs.nixcord.legcord = {
    enable = true;

    # Optionally bundle Vencord or Equicord (also installs userPlugins)
    vencord.enable = true;
    # equicord.enable = true;

    settings = {
      channel = "stable";
      tray = "dynamic";
      minimizeToTray = true;
      mods = [ "vencord" ];
      doneSetup = true;
    };
  };
}
```

## GoofCord

[GoofCord](https://github.com/Milkshiift/GoofCord) uses Vencord by default.
Nixcord bundles the mod and plugin settings with the client:

```nix
{
  programs.nixcord.goofcord = {
    enable = true;

    # Defaults to Vencord; use "equicord" for Equicord
    clientMod = "vencord";

    settings = {
      minimizeToTray = true;
      hardwareAcceleration = true;
    };
  };
}
```

Nixcord also adds Apple silicon macOS support to the Nixpkgs GoofCord package.

## Third-party user plugins

Add custom Vencord or Equicord plugins with `userPlugins`, then enable them in
`extraConfig.plugins`.

GitHub, GitLab, Codeberg, SourceHut, and Bitbucket have short aliases. Any other
Git forge, including self-hosted instances, works through a
`git+<url>?rev=<commit>` source. Remote sources must be pinned to a full
40-character commit hash.

```nix
{
  programs.nixcord = {
    # Popular forges have short aliases
    userPlugins = {
      githubPlugin = "github:someUser/githubPlugin/abc123def456...";
      codebergPlugin = "codeberg:someUser/codebergPlugin/abc123def456...";

      # Every other or self-hosted forge uses a generic Git URL
      selfHostedPlugin = "git+https://git.example.org/someUser/selfHostedPlugin.git?rev=abc123def456...";

      # Local path (requires --impure with flakes)
      myLocalPlugin = "/home/user/projects/myPlugin";

      # Nix path literal
      anotherPlugin = ./plugins/anotherPlugin;
    };

    extraConfig.plugins = {
      githubPlugin.enable = true;
      codebergPlugin.enable = true;
      selfHostedPlugin.enable = true;
      myLocalPlugin.enable = true;
      anotherPlugin.enable = true;
    };
  };
}
```

## Dorion

Launch Dorion and load Discord once before enabling the module. This creates the
WebKit storage that Nixcord needs to apply Vencord settings.

1. Run Dorion once before enabling Nixcord's Dorion module:
   `nix run nixpkgs#dorion`
2. Log in, wait for Discord to finish loading, then close it.
3. Enable `dorion.enable = true` in your config and rebuild.

<!-- prettier-ignore -->
> [!WARNING]
> Upstream Dorion still marks Linux voice as unsupported because WebKitGTK
> WebRTC support is incomplete. Voice/video may fail even after Nixcord is
> configured.

## Docs

- **Web:** [4evy.github.io/nixcord](https://4evy.github.io/nixcord/)
- **Build locally:** `nix build .#docs`
- **JSON:** `nix build .#docs-json`

<!-- prettier-ignore -->
> [!CAUTION]
> Vencord and Equicord violate Discord's terms of service. Use them at your own
> risk.
