{ testLib, lib }:

let
  inherit (testLib.assertions) hmFails hmMessages;
in
{
  "discord cannot enable vencord and equicord together" =
    let
      fails = hmFails {
        enable = true;
        discord.vencord.enable = true;
        discord.equicord.enable = true;
      };
    in
    assert fails;
    true;

  "mutual exclusivity failure explains the conflict" =
    let
      messages = hmMessages {
        enable = true;
        discord.vencord.enable = true;
        discord.equicord.enable = true;
      };
    in
    assert builtins.any (message: lib.hasInfix "mutually exclusive" message) messages;
    true;

  "discord accepts vencord without equicord" =
    let
      fails = hmFails {
        enable = true;
        discord.vencord.enable = true;
        discord.equicord.enable = false;
      };
    in
    assert !fails;
    true;
}
