<div align="center">

<img src="https://repository-images.githubusercontent.com/818567152/b2e5b9af-ce34-430e-a2ec-e98e0d3470d8" alt="Nixcord" width="240">

# Nixcord

**One Nix config for your Discord mods, themes, and clients.**

Manage [Vencord](https://github.com/Vendicated/Vencord),
[Equicord](https://github.com/Equicord/Equicord), [Vesktop](https://github.com/Vencord/Vesktop),
[Dorion](https://github.com/SpikeHD/Dorion), and [Legcord](https://github.com/Legcord/Legcord) from
your Nix config.

[![Flake Checks](https://github.com/4evy/nixcord/actions/workflows/check.yaml/badge.svg?branch=main)](https://github.com/4evy/nixcord/actions/workflows/check.yaml)
[![Docs](https://github.com/4evy/nixcord/actions/workflows/github-pages.yaml/badge.svg?branch=main)](https://github.com/4evy/nixcord/actions/workflows/github-pages.yaml)
[![MIT License](https://img.shields.io/github/license/4evy/nixcord?style=flat-square)](https://github.com/4evy/nixcord/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/4evy/nixcord?style=flat-square&logo=github)](https://github.com/4evy/nixcord/stargazers)
[![Built with Nix](https://img.shields.io/badge/built%20with-Nix-5277C3?style=flat-square&logo=nixos&logoColor=white)](https://nixos.org/)

[Quickstart](#quickstart) | [Without Flakes](#without-flakes) | [Configuration](#configuration) |
[Settings Converter](#settings-converter) | [Options](https://4evy.github.io/nixcord/) |
[User Plugins](#third-party-user-plugins)

</div>

<!-- prettier-ignore -->
> [!IMPORTANT]
> Nixcord is declarative, so changes made in the client's in-app "Plugins" menu are not persistent.
> Update your `.nix` file to make settings stick.

## Quickstart

Add to `flake.nix`:

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

Then import the module

**Home Manager (Recommended)**

Most people should use this. It handles paths and permissions for you

```nix
# home.nix
{ inputs, ... }: {
  imports = [ inputs.nixcord.homeModules.nixcord ];
  # ... config
}
```

**NixOS (System-wide)**

If you don't use Home Manager

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

**nix-darwin (macOS)**

If you are managing your Mac system-wide

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

## Without Flakes

Nixcord has a native `default.nix`; using it does not enable flakes or evaluate `flake.lock`.
[npins](https://github.com/andir/npins) is the recommended way to pin both Nixpkgs and Nixcord.

Run these commands from the root of your Nix configuration. They create an `npins` directory, pin
the same Nixpkgs release used in the flake quickstart, and pin Nixcord's `main` branch:

```sh
nix-shell -p npins --run 'npins init --bare'
nix-shell -p npins --run 'npins add github NixOS nixpkgs --branch nixos-26.05 --name nixpkgs'
nix-shell -p npins --run 'npins add github 4evy nixcord --branch main'
```

Commit the generated `npins/default.nix` and `npins/sources.json` files so every machine evaluates
the same revisions.

Import the pinned sources, create your package set, and pass that package set to Nixcord. For
example, in a Home Manager configuration:

```nix
let
  sources = import ./npins;
  pkgs = import sources.nixpkgs {
    config.allowUnfree = true;
  };
  nixcord = import sources.nixcord { inherit pkgs; };
in
{
  imports = [ nixcord.homeModules.nixcord ];

  programs.nixcord = {
    enable = true;
    discord.vencord.enable = true;
  };
}
```

**If your configuration already provides `pkgs`, reuse it instead of importing Nixpkgs again.**

Or if you're using something like [nixtamal](https://nixtamal.toast.al/) inside home-manager and/or can't use `pkgs` you can write:
```nix
let
  nixcord = import nixtamal.nixcord { nixpkgs = nixtamal.nixpkgs; };
in
...
```

For
NixOS or nix-darwin, select the corresponding module just as in the flake examples above:

```nix
# NixOS
imports = [ nixcord.nixosModules.nixcord ];

# nix-darwin
imports = [ nixcord.darwinModules.nixcord ];
```

System-wide NixOS and nix-darwin configurations must also set `programs.nixcord.user` to the user
whose Discord configuration Nixcord should manage.

Update the pins explicitly when you want newer revisions, then review and commit the changes to
`npins/sources.json`:

```sh
nix-shell -p npins --run 'npins update nixpkgs nixcord'
```

The same import interface works if the Nixcord source comes from a channel, `fetchTarball`, or
another pinning tool:

```nix
nixcord = import path-to-nixcord { inherit pkgs; };
```

The imported source exposes `homeModules`, `nixosModules`, `darwinModules`, `packages`, `overlay`,
and `overlays.default`. Package derivations are also available directly, so a source checkout
supports:

```sh
nix-build -A vencord
nix-build -A docs
nix-shell
```

The overlay keeps Nixcord packages namespaced under `pkgs.nixcord`:

```nix
let
  nixcord = import sources.nixcord { inherit pkgs; };
  pkgsWithNixcord = pkgs.extend nixcord.overlay;
in
pkgsWithNixcord.nixcord.vencord
```

## Configuration

You can configure Vencord, Equicord, Vesktop, Dorion, or Legcord

**Tip:** Launch your client once manually to look through the plugins list so you know what you
actually want to enable

```nix
{
  programs.nixcord = {
    enable = true;

    # Choose your Discord mod client (enable at most one of these two)
    discord.vencord.enable = true;      # Standard Vencord
    # discord.equicord.enable = true;   # Equicord (has more plugins)

    # Or these
    vesktop.enable = true;
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

Check the [online docs](https://4evy.github.io/nixcord/) for the full list of options

## Settings Converter

Already have Vencord or Equicord configured? The docs include a browser-side
[settings converter](https://4evy.github.io/nixcord/#sec-converter) that turns an exported
`settings.json` into Nixcord config.

## Legcord

[Legcord](https://github.com/Legcord/Legcord) is a lightweight Discord client. Enable it with:

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

## Third-Party User Plugins

You can load custom Vencord/Equicord plugins that aren't in the upstream plugin list using
`userPlugins`. Any plugin you add also needs to be enabled in `extraConfig.plugins`:

```nix
{
  programs.nixcord = {
    # GitHub repo at a specific commit
    userPlugins = {
      someCoolPlugin = "github:someUser/someCoolPlugin/abc123def456...";

      # Local path (requires --impure with flakes)
      myLocalPlugin = "/home/user/projects/myPlugin";

      # Nix path literal
      anotherPlugin = ./plugins/anotherPlugin;
    };

    extraConfig.plugins = {
      someCoolPlugin.enable = true;
      myLocalPlugin.enable = true;
      anotherPlugin.enable = true;
    };
  };
}
```

## A Note on Dorion

Dorion can read its Nix-managed `config.json` immediately, but Vencord settings live in Discord's
WebKit `LocalStorage`. That SQLite database is only created after Dorion has successfully loaded
Discord once, so Nixcord cannot patch `VencordSettings` on a completely fresh profile.

1. Run Dorion once before enabling Nixcord's Dorion module: `nix run nixpkgs#dorion`
2. Log in, wait for Discord to finish loading, then close it.
3. Enable `dorion.enable = true` in your config and rebuild.

<!-- prettier-ignore -->
> [!WARNING]
> Upstream Dorion still marks Linux voice as unsupported because WebKitGTK WebRTC support is
> incomplete. Voice/video may fail even after Nixcord is configured.

## Docs

- **Web:** [4evy.github.io/nixcord](https://4evy.github.io/nixcord/)
- **Build locally:** `nix build .#docs`
- **JSON:** `nix build .#docs-json`

<!-- prettier-ignore -->
> [!CAUTION]
> Vencord & Equicord violate Discord ToS. You probably know this already, but use at your own
> risk!
