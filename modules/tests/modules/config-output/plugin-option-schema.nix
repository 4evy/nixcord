{ testLib }:

let
  inherit (testLib) lib;
  evaluated = lib.modules.evalModules {
    modules = [
      {
        options.plugins = import ../../../plugins/options/options.nix {
          inherit lib;
        };
      }
      {
        config.plugins.channelTabs.tabSet = {
          __nixRaw = "ordinary plugin data";
          nested.first = true;
        };
      }
      { config.plugins.channelTabs.tabSet.nested.second = [ 2 ]; }
    ];
  };
in
{
  "generated enum options preserve choices and defaults" =
    assert evaluated.options.plugins.channelTabs.onStartup.type.name == "enum";
    assert evaluated.options.plugins.channelTabs.onStartup.type.check "remember";
    assert !evaluated.options.plugins.channelTabs.onStartup.type.check "invalid";
    assert evaluated.config.plugins.channelTabs.onStartup == "nothing";
    true;

  "raw-number sentinel keys remain ordinary attribute data" =
    assert evaluated.config.plugins.channelTabs.tabSet.__nixRaw == "ordinary plugin data";
    true;

  "attribute settings use recursively mergeable JSON types" =
    assert evaluated.options.plugins.channelTabs.tabSet.type.name == "attrsOf";
    assert
      evaluated.config.plugins.channelTabs.tabSet.nested == {
        first = true;
        second = [ 2 ];
      };
    true;
}
