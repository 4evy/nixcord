{ testLib }:

let
  inherit (testLib) lib;
  schema = {
    Demo = {
      description = "Plugin option schema validation";
      settings = {
        emptyEnum = {
          type = "types.enum";
          enumValues = [ ];
        };
        sentinelAttrs = {
          type = "types.attrs";
          default.__nixRaw = "ordinary plugin data";
        };
        mergeableAttrs = {
          type = "types.attrs";
        };
      };
    };
  };
  evaluated = lib.modules.evalModules {
    modules = [
      {
        options.plugins = import ../../../plugins/mkPluginOptions.nix {
          inherit lib schema;
        };
      }
      { config.plugins.Demo.mergeableAttrs.first = true; }
      { config.plugins.Demo.mergeableAttrs.second = [ 2 ]; }
    ];
  };
in
{
  "empty enum domains construct a valid option type" =
    assert evaluated.options.plugins.Demo.emptyEnum.type.name == "enum";
    true;

  "raw-number sentinel keys remain ordinary attribute defaults" =
    assert
      evaluated.config.plugins.Demo.sentinelAttrs == {
        __nixRaw = "ordinary plugin data";
      };
    true;

  "attribute settings use recursively mergeable JSON types" =
    assert evaluated.options.plugins.Demo.mergeableAttrs.type.name == "attrsOf";
    assert
      evaluated.config.plugins.Demo.mergeableAttrs == {
        first = true;
        second = [ 2 ];
      };
    true;
}
