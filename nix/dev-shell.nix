{ pkgs }:
pkgs.mkShellNoCC {
  packages = with pkgs; [
    actionlint
    bun
    git
    jq
    nixfmt
    nodejs_24
    npins
    treefmt
    yamllint
    zizmor
  ];

  shellHook = ''
    echo "nixcord development shell"
    echo "Run 'bun install' once, then 'bun run check' and 'nix flake check'."
  '';
}
