{ pkgs }:

let
  testLib = import ./lib { inherit pkgs; };
  inherit (testLib) lib;

  rev = "0123456789abcdef0123456789abcdef01234567";
  localPlugin = ../../packages/parser/tests/fixtures/equicord/src/plugins/shared-plugin;

  coerceWith = fetchGit: import ../lib/userPlugins.nix { inherit lib fetchGit; };
  fetches =
    value: expected:
    (coerceWith (
      source:
      assert source == expected;
      localPlugin
    ))
      value == localPlugin;
  rejects = value: !(builtins.tryEval ((coerceWith (_: localPlugin)) value)).success;
in
testLib.run.tests "user-plugins-test" {
  "generic Git sources work with arbitrary hosts and transports" =
    assert fetches "git+https://git.example.org/user/plugin.git?rev=${rev}" {
      url = "https://git.example.org/user/plugin.git";
      inherit rev;
    };
    assert fetches "git+ssh://git@git.internal.example/user/plugin.git?rev=${rev}" {
      url = "ssh://git@git.internal.example/user/plugin.git";
      inherit rev;
    };
    true;

  "popular forge shorthands resolve to their canonical Git hosts" =
    let
      sources = [
        {
          value = "github:user/plugin/${rev}";
          url = "https://github.com/user/plugin";
        }
        {
          value = "gitlab:group/subgroup/plugin/${rev}";
          url = "https://gitlab.com/group/subgroup/plugin";
        }
        {
          value = "codeberg:user/plugin/${rev}";
          url = "https://codeberg.org/user/plugin";
        }
        {
          value = "sourcehut:~user/plugin/${rev}";
          url = "https://git.sr.ht/~user/plugin";
        }
        {
          value = "bitbucket:user/plugin/${rev}";
          url = "https://bitbucket.org/user/plugin";
        }
      ];
    in
    assert builtins.all (
      source:
      fetches source.value {
        inherit (source) url;
        inherit rev;
      }
    ) sources;
    true;

  "remote sources reject branches, partial revisions, and unknown shorthands" =
    let
      invalidSources = [
        "git+https://git.example.org/user/plugin.git?ref=main"
        "git+https://git.example.org/user/plugin.git?rev=0123456"
        "codeberg:user/plugin/main"
        "gitea:user/plugin/${rev}"
      ];
    in
    assert !rejects "git+https://git.example.org/user/plugin.git?rev=${rev}";
    assert builtins.all rejects invalidSources;
    true;
}
