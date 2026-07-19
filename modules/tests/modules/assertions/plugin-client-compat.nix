{ testLib, lib }:

let
  inherit (testLib.assertions) hmFails hmMessages;
  inherit (testLib.fixtures.plugins)
    firstVencordOnly
    firstEquicordOnly
    ;
in
{
  "equicord-only plugin fails with vencord-only client" =
    let
      fails = hmFails {
        enable = true;
        discord.vencord.enable = true;
        discord.equicord.enable = false;
        vesktop.enable = false;
        equibop.enable = false;
        config.plugins.${firstEquicordOnly}.enable = true;
      };
    in
    assert fails;
    true;

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
    assert builtins.any (message: lib.hasInfix firstEquicordOnly message) messages;
    true;

  "vencord-only plugin fails with equicord-only client" =
    let
      fails = hmFails {
        enable = true;
        discord.vencord.enable = false;
        discord.equicord.enable = true;
        vesktop.enable = false;
        equibop.enable = false;
        config.plugins.${firstVencordOnly}.enable = true;
      };
    in
    assert fails;
    true;

  "client-specific settings do not hide an incompatible global enable" =
    let
      fails = hmFails {
        enable = true;
        discord.enable = false;
        vesktop.enable = true;
        extraConfig.plugins.${firstEquicordOnly}.enable = true;
        vesktopConfig.plugins.${firstEquicordOnly}.regressionSetting = true;
      };
    in
    assert fails;
    true;

}
