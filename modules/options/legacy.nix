{ lib, ... }:
{
  imports = [
    (lib.modules.mkRenamedOptionModule
      [ "programs" "nixcord" "package" ]
      [ "programs" "nixcord" "discord" "package" ]
    )
    (lib.modules.mkRenamedOptionModule
      [ "programs" "nixcord" "vesktopPackage" ]
      [ "programs" "nixcord" "vesktop" "package" ]
    )
    (lib.modules.mkRenamedOptionModule
      [ "programs" "nixcord" "vesktopConfigDir" ]
      [ "programs" "nixcord" "vesktop" "configDir" ]
    )
    (lib.modules.mkRenamedOptionModule
      [ "programs" "nixcord" "openASAR" "enable" ]
      [ "programs" "nixcord" "discord" "openASAR" "enable" ]
    )
    (lib.modules.mkChangedOptionModule
      [ "programs" "nixcord" "discord" "branch" ]
      [ "programs" "nixcord" "discord" "branches" ]
      (config: lib.modules.mkDefault [ config.programs.nixcord.discord.branch ])
    )
  ];
}
