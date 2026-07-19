{ testLib, lib }:

let
  inherit (testLib) pkgs;
  inherit (testLib.assertions) hmWarnings;

  mkDiscordPackage =
    name: functionArgs:
    let
      package = pkgs.runCommand "nixcord-${name}-discord-stub" { } "mkdir $out" // {
        override = lib.setFunctionArgs (_args: package) functionArgs;
      };
    in
    package;

  baseFunctionArgs = {
    branch = true;
    commandLineArgs = true;
    equicord = true;
    vencord = true;
    withEquicord = true;
    withOpenASAR = true;
    withVencord = true;
  };

  krispWarning = message: lib.hasInfix "does not expose nixcord's withKrisp" message;
in
{
  "krisp warns when a custom Discord package cannot apply it" =
    let
      warnings = hmWarnings {
        enable = true;
        discord = {
          package = mkDiscordPackage "without-krisp" baseFunctionArgs;
          vencord.enable = true;
          krisp.enable = true;
        };
      };
    in
    assert builtins.any krispWarning warnings;
    true;

  "krisp does not warn when the Discord package supports it" =
    let
      warnings = hmWarnings {
        enable = true;
        discord = {
          package = mkDiscordPackage "with-krisp" (baseFunctionArgs // { withKrisp = true; });
          vencord.enable = true;
          krisp.enable = true;
        };
      };
    in
    assert !(builtins.any krispWarning warnings);
    true;
}
