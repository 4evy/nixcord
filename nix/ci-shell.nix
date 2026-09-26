{ pkgs }:
pkgs.mkShellNoCC {
  packages = with pkgs; [
    actionlint
    gitMinimal
    shellcheck
    yamllint
    zizmor
  ];
}
