{ testLib, lib }:

let
  inherit (testLib.assertions) hmMessages hmWarnings;
in
{
  "mutual exclusivity failure explains the conflict" =
    let
      messages = hmMessages {
        enable = true;
        discord.vencord.enable = true;
        discord.equicord.enable = true;
      };
    in
    assert builtins.any (message: lib.strings.hasInfix "mutually exclusive" message) messages;
    true;

  "legcord cannot bundle vencord and equicord together" =
    let
      messages = hmMessages {
        enable = true;
        discord.enable = false;
        legcord = {
          enable = true;
          vencord.enable = true;
          equicord.enable = true;
        };
      };
    in
    assert builtins.any (
      message:
      lib.strings.hasInfix "legcord.vencord.enable" message
      && lib.strings.hasInfix "mutually exclusive" message
    ) messages;
    true;

  "goofcord requires an available package" =
    let
      messages = hmMessages {
        enable = true;
        discord.enable = false;
        goofcord = {
          enable = true;
          package = null;
        };
      };
    in
    assert builtins.any (
      message: lib.strings.hasInfix "goofcord.package" message && lib.strings.hasInfix "non-null" message
    ) messages;
    true;

  "goofcord settings assets must be an attribute set" =
    let
      messages = hmMessages {
        enable = true;
        discord.enable = false;
        goofcord = {
          enable = true;
          package = testLib.pkgs.runCommandLocal "nixcord-goofcord-assets-stub" { } "mkdir $out" // {
            src = testLib.pkgs.emptyDirectory;
          };
          settings.assets = [ "https://example.invalid/not-an-attribute-set.js" ];
        };
      };
    in
    assert builtins.any (
      message:
      lib.strings.hasInfix "goofcord.settings.assets" message
      && lib.strings.hasInfix "attribute set" message
    ) messages;
    true;

  "goofcord settings asset values must be strings" =
    let
      messages = hmMessages {
        enable = true;
        discord.enable = false;
        goofcord = {
          enable = true;
          package = testLib.pkgs.runCommandLocal "nixcord-goofcord-asset-value-stub" { } "mkdir $out" // {
            src = testLib.pkgs.emptyDirectory;
          };
          settings.assets.Invalid = 42;
        };
      };
    in
    assert builtins.any (
      message:
      lib.strings.hasInfix "goofcord.settings.assets values" message
      && lib.strings.hasInfix "paths or URLs" message
    ) messages;
    true;

  "discord warns when vencord and equicord are both disabled" =
    let
      warnings = hmWarnings {
        enable = true;
      };
    in
    assert builtins.any (message: lib.strings.hasInfix "both disabled" message) warnings;
    assert builtins.any (message: lib.strings.hasInfix "without Vencord or Equicord" message) warnings;
    assert builtins.any (message: lib.strings.hasInfix "silenceNoModClientWarning" message) warnings;
    true;

  "discord mod disabled warning can be acknowledged" =
    let
      warnings = hmWarnings {
        enable = true;
        discord.silenceNoModClientWarning = true;
      };
    in
    assert !(builtins.any (message: lib.strings.hasInfix "both disabled" message) warnings);
    assert
      !(builtins.any (message: lib.strings.hasInfix "without Vencord or Equicord" message) warnings);
    true;

  "discord mod disabled warning is skipped when discord is disabled" =
    let
      warnings = hmWarnings {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
      };
    in
    assert !(builtins.any (message: lib.strings.hasInfix "both disabled" message) warnings);
    true;

  "multiple Discord branches require distinct config directories" =
    let
      messages = hmMessages {
        enable = true;
        discord = {
          branches = [
            "canary"
            "stable"
          ];
          configDir = "/home/testuser/.config/discord";
        };
      };
    in
    assert builtins.any (
      message:
      lib.strings.hasInfix "multiple branches to the same Discord config directory" message
      && lib.strings.hasInfix "/home/testuser/.config/discord" message
    ) messages;
    true;
}
