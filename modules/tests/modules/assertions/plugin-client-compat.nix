{ testLib, lib }:

let
  inherit (testLib.assertions) hmFails hmMessages;
  inherit (testLib.fixtures.plugins)
    firstShared
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

  "shared plugin works with vencord" =
    let
      fails = hmFails {
        enable = true;
        discord.vencord.enable = true;
        config.plugins.${firstShared}.enable = true;
      };
    in
    assert !fails;
    true;
}
