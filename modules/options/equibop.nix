{ lib, ... }:
{
  imports = [
    (lib.modules.importApply ./mkVesktopLikeModule.nix {
      moduleName = "equibop";
      displayName = "Equibop";
      modName = "Equicord";
      useSystemOption = "useSystemEquicord";
      nullPackageOnDarwin = true;
    })
  ];
}
