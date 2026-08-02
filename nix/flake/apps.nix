{
  perSystem =
    {
      pkgs,
      ...
    }:
    {
      apps.generate = {
        type = "app";
        program = pkgs.lib.getExe (
          pkgs.writeShellApplication {
            name = "generate-plugin-options";
            runtimeInputs = [
              pkgs.nix
              pkgs.nixfmt
            ];
            text = ''
              generated=$(nix build .#generate --no-link --print-out-paths)
              mkdir -p ./modules/plugins
              cp -R "$generated/plugins/." ./modules/plugins/
              chmod -R u+w ./modules/plugins
              nixfmt ./modules/plugins/*.nix
            '';
          }
        );
        meta.description = "Regenerate nixcord plugin option files";
      };
    };
}
