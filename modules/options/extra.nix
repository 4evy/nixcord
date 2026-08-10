{ lib, pkgs, ... }:
let
  jsonFormat = pkgs.formats.json { };
  jsonAttrs = lib.types.attrsOf jsonFormat.type;
in
{
  options.programs.nixcord = {
    vesktopConfig = lib.options.mkOption {
      type = jsonAttrs;
      default = { };
      description = "Additional config merged into `programs.nixcord.config` for Vesktop only.";
    };
    equibopConfig = lib.options.mkOption {
      type = jsonAttrs;
      default = { };
      description = "Additional config merged into `programs.nixcord.config` for Equibop only.";
    };
    goofcordConfig = lib.options.mkOption {
      type = jsonAttrs;
      default = { };
      description = "Additional config merged into `programs.nixcord.config` for GoofCord only.";
    };
    vencordConfig = lib.options.mkOption {
      type = jsonAttrs;
      default = { };
      description = "Additional config merged into `programs.nixcord.config` for Vencord (Discord) only.";
    };
    equicordConfig = lib.options.mkOption {
      type = jsonAttrs;
      default = { };
      description = "Additional config merged into `programs.nixcord.config` for Equicord (Discord) only.";
    };
    extraConfig = lib.options.mkOption {
      type = jsonAttrs;
      default = { };
      description = "Additional config merged into `programs.nixcord.config` for all clients.";
    };
    userPlugins =
      let
        githubRegex = "github:([[:alnum:].-]+)/([[:alnum:]/-]+)/([0-9a-f]{40})";
        coerce =
          value:
          let
            githubMatches = builtins.match githubRegex value;
          in
          if githubMatches != null then
            builtins.fetchGit {
              url = "https://github.com/${builtins.elemAt githubMatches 0}/${builtins.elemAt githubMatches 1}";
              rev = builtins.elemAt githubMatches 2;
            }
          else if lib.strings.hasPrefix "/" value then
            /. + value
          else
            throw "programs.nixcord.userPlugins: '${value}' is not a valid github: URL (github:owner/repo/commitHash) or absolute local path (must start with /)";
      in
      lib.options.mkOption {
        type = lib.types.attrsOf (lib.types.coercedTo lib.types.str coerce lib.types.path);
        description = ''
          User plugins to fetch and install. Any required JSON config must be enabled in `extraConfig`.

          Accepts:
          - GitHub URLs: `github:owner/repo/commitHash`
          - Absolute local paths: `/path/to/plugin` (requires `--impure` with flakes)
          - Nix path literals: `./relative/path` or `/absolute/path`
          - Packages/derivations
        '';
        default = { };
        example = {
          someCoolPlugin = "github:someUser/someCoolPlugin/someHashHere";
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
        description = "Plugin option names to rename while generating JSON.";
        default = { };
      };
      settingRenames = lib.options.mkOption {
        type = lib.types.attrsOf (lib.types.attrsOf lib.types.str);
        description = "Setting names to rename while generating JSON.";
        default = { };
      };
    };
  };
}
