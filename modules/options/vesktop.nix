{ lib, ... }:
{
  imports = [
    (lib.modules.importApply ./mkVesktopLikeModule.nix {
      moduleName = "vesktop";
      displayName = "Vesktop";
      modName = "Vencord";
      useSystemOption = "useSystemVencord";
    })
  ];
}
