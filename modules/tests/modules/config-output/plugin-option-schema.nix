{ testLib }:

let
  inherit (testLib) lib;
  schema = builtins.toFile "nixcord-plugin-option-schema.json" (
    builtins.toJSON {
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
        };
      };
    }
  );
  evaluated = lib.evalModules {
    modules = [
      {
        options.plugins = import ../../../plugins/mkPluginOptions.nix {
          inherit lib;
          file = schema;
        };
      }
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
}
