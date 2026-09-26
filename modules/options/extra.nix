{ lib, pkgs, ... }:
let
  jsonFormat = pkgs.formats.json { };
  jsonAttrs = lib.types.attrsOf jsonFormat.type;
  configOptions =
    lib.attrsets.mapAttrs
      (
        _: target:
        lib.options.mkOption {
          type = jsonAttrs;
          default = { };
          description = "Free-form mod settings for ${target}. These override matching values in `programs.nixcord.config`; client-specific values also override `extraConfig`.";
        }
      )
      {
        vesktopConfig = "Vesktop only";
        equibopConfig = "Equibop only";
        goofcordConfig = "GoofCord only";
        vencordConfig = "Vencord (Discord) only";
        equicordConfig = "Equicord (Discord) only";
        extraConfig = "all clients";
      };
in
{
  options.programs.nixcord = configOptions // {
    userPlugins =
      let
        coerce = import ../lib/userPlugins.nix { inherit lib; };
      in
      lib.options.mkOption {
        type = lib.types.attrsOf (lib.types.coercedTo lib.types.str coerce lib.types.path);
        description = ''
          Plugin sources to include in the Vencord or Equicord build. Enable each
          plugin in `extraConfig.plugins` using its declared name. Remote sources
          require a full 40-character commit hash; branches and tags are rejected.

          Accepts:
          - Generic Git URLs for any forge: `git+https://forge.example/owner/repo.git?rev=commitHash`
          - Popular forge shorthands: `github:`, `gitlab:`, `codeberg:`, `sourcehut:`, and `bitbucket:`
          - Absolute local paths: `/path/to/plugin` (requires `--impure` with flakes)
          - Nix path literals: `./relative/path` or `/absolute/path`
          - Packages/derivations
        '';
        default = { };
        example = {
          githubPlugin = "github:someUser/githubPlugin/someHashHere";
          codebergPlugin = "codeberg:someUser/codebergPlugin/someHashHere";
          localPlugin = "/home/user/projects/myPlugin";
        };
      };
    parseRules = {
      upperNames = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        description = "Option names that should be converted to UPPER_SNAKE_CASE in generated JSON.";
        default = [ ];
      };
      lowerPluginTitles = lib.options.mkOption {
        type = lib.types.listOf lib.types.str;
        description = "Plugin names that should remain lowercase in generated JSON.";
        default = [ ];
        example = [ "petpet" ];
      };
      pluginRenames = lib.options.mkOption {
        type = lib.types.attrsOf lib.types.str;
        description = "Nix plugin option names mapped to upstream plugin names in the generated JSON.";
        default = { };
      };
      settingRenames = lib.options.mkOption {
        type = lib.types.attrsOf (lib.types.attrsOf lib.types.str);
        description = "Nix setting names mapped to upstream JSON keys, grouped by plugin or settings context.";
        default = { };
      };
    };
  };
}
