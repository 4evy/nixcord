{
  perSystem =
    {
      config,
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

      apps.update-goofcord = {
        type = "app";
        program = pkgs.lib.getExe config.packages.goofcord.passthru.updateScript;
        meta.description = "Refresh GoofCord's aarch64-darwin dependency snapshot";
      };
    };
}
