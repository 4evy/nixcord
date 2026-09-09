{ testLib, lib }:

let
  inherit (testLib.assertions) hmMessages;
  inherit (testLib.fixtures.plugins)
    firstVencordOnly
    firstEquicordOnly
    ;
in
{
  "equicord-only plugin failure names the plugin" =
    let
      messages = hmMessages {
        enable = true;
        discord.vencord.enable = true;
        discord.equicord.enable = false;
        vesktop.enable = false;
        equibop.enable = false;
        config.plugins.${firstEquicordOnly}.enable = true;
      };
    in
    assert builtins.length messages == 1;
    assert builtins.any (message: lib.strings.hasInfix firstEquicordOnly message) messages;
    true;

  "vencord-only plugin fails with equicord-only client" =
    let
      messages = hmMessages {
        enable = true;
        discord.vencord.enable = false;
        discord.equicord.enable = true;
        vesktop.enable = false;
        equibop.enable = false;
        config.plugins.${firstVencordOnly}.enable = true;
      };
    in
    assert builtins.length messages == 1;
    assert lib.strings.hasInfix firstVencordOnly (builtins.head messages);
    true;

  "client-specific settings do not hide an incompatible global enable" =
    let
      messages = hmMessages {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
        extraConfig.plugins.${firstEquicordOnly}.enable = true;
        vesktopConfig.plugins.${firstEquicordOnly}.regressionSetting = true;
      };
    in
    assert builtins.length messages == 1;
    assert lib.strings.hasInfix firstEquicordOnly (builtins.head messages);
    true;

  "compatible client enables pass without assertions" =
    builtins.all
      (
        client:
        hmMessages {
          enable = true;
          discord.enable = false;
          vesktop.enable = client == "vencord";
          equibop.enable = client == "equicord";
          config.plugins.${if client == "vencord" then firstVencordOnly else firstEquicordOnly}.enable = true;
        } == [ ]
      )
      [
        "vencord"
        "equicord"
      ];
}
