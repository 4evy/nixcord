{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };
  inherit (testLib) lib stubs;

  evalPlatform =
    module: stub: platformConfig:
    (lib.modules.evalModules {
      modules = [
        stub
        (import module)
        {
          _module.args.nixcordPkgs = { };
          programs.nixcord = {
            enable = true;
            discord.vencord.enable = true;
          };
        }
        platformConfig
      ];
      specialArgs = { inherit pkgs; };
    }).config.programs.nixcord;

  hm = evalPlatform ../hm/default.nix stubs.hm {
    home = {
      username = "testuser";
      homeDirectory = "/srv/home/testuser";
    };
    xdg.configHome = "/srv/config/testuser";
  };

  nixos = evalPlatform ../nixos/default.nix stubs.nixos {
    programs.nixcord.user = "testuser";
    users.users.testuser = {
      name = "testuser";
      home = "/srv/home/testuser";
      isNormalUser = true;
    };
  };

  nixosUnmanaged = evalPlatform ../nixos/default.nix stubs.nixos {
    programs.nixcord.user = "existing-user";
  };

  darwin = evalPlatform ../darwin/default.nix stubs.darwin {
    programs.nixcord.user = "testuser";
    users.users.testuser = {
      name = "testuser";
      home = "/Volumes/Users/testuser";
    };
  };

  darwinUnmanaged = evalPlatform ../darwin/default.nix stubs.darwin {
    programs.nixcord.user = "existing-user";
  };

  darwinNullHome = evalPlatform ../darwin/default.nix stubs.darwin {
    programs.nixcord.user = "testuser";
    users.users.testuser = {
      name = "testuser";
      home = null;
    };
  };
  tests = {
    "Home Manager paths come from home and XDG options" =
      hm.homeDirectory == "/srv/home/testuser"
      && hm.xdgConfigHome == "/srv/config/testuser"
      &&
        hm.discord.configDir == (
          if pkgs.stdenvNoCC.hostPlatform.isLinux then
            "/srv/config/testuser/discord"
          else
            "/srv/home/testuser/Library/Application Support/discord"
        )
      &&
        hm.goofcord.configDir == (
          if pkgs.stdenvNoCC.hostPlatform.isLinux then
            "/srv/config/testuser/goofcord/GoofCord"
          else
            "/srv/home/testuser/Library/Application Support/goofcord/GoofCord"
        );
  }
  // lib.attrsets.optionalAttrs pkgs.stdenvNoCC.hostPlatform.isLinux {
    "NixOS paths come from the configured user home" =
      nixos.homeDirectory == "/srv/home/testuser"
      && nixos.xdgConfigHome == "/srv/home/testuser/.config"
      && nixos.discord.configDir == "/srv/home/testuser/.config/discord"
      && nixos.goofcord.configDir == "/srv/home/testuser/.config/goofcord/GoofCord";

    "NixOS keeps supporting existing unmanaged users" =
      nixosUnmanaged.homeDirectory == "/home/existing-user"
      && nixosUnmanaged.xdgConfigHome == "/home/existing-user/.config";
  }
  // lib.attrsets.optionalAttrs pkgs.stdenvNoCC.hostPlatform.isDarwin {
    "nix-darwin paths come from the configured user home" =
      darwin.homeDirectory == "/Volumes/Users/testuser"
      && darwin.xdgConfigHome == "/Volumes/Users/testuser/.config"
      && darwin.discord.configDir == "/Volumes/Users/testuser/Library/Application Support/discord"
      &&
        darwin.goofcord.configDir
        == "/Volumes/Users/testuser/Library/Application Support/goofcord/GoofCord";

    "nix-darwin keeps supporting existing unmanaged users" =
      darwinUnmanaged.homeDirectory == "/Users/existing-user"
      && darwinUnmanaged.xdgConfigHome == "/Users/existing-user/.config";

    "nix-darwin falls back when the configured user home is null" =
      darwinNullHome.homeDirectory == "/Users/testuser"
      && darwinNullHome.xdgConfigHome == "/Users/testuser/.config";
  };
in
testLib.run.tests "platform-paths-test" tests
