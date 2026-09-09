{ lib }:

let
  homeFileSource =
    config: path:
    if builtins.hasAttr path config.home.file then
      config.home.file.${path}.source
    else
      let
        specs = builtins.filter (spec: spec.dest == path) config._nixcordTest.common.fileSpecs;
        spec = lib.lists.findSingle (
          spec: spec.writable
        ) (throw "missing writable file ${path}") (throw "duplicate writable file ${path}") specs;
        activation = config.home.activation."nixcord-${spec.name}".data;
      in
      assert lib.strings.hasInfix (builtins.unsafeDiscardStringContext (
        lib.strings.escapeShellArg spec.src
      )) activation;
      assert lib.strings.hasInfix (lib.strings.escapeShellArg spec.dest) activation;
      spec.src;

  homeActivationSource =
    config: name:
    let
      spec =
        lib.lists.findSingle (spec: "nixcord-${spec.name}" == name) (throw "missing activation ${name}")
          (throw "duplicate activation ${name}")
          config._nixcordTest.common.fileSpecs;
    in
    homeFileSource config spec.dest;

  json = source: filter: ''
    jq -e ${lib.strings.escapeShellArg filter} ${lib.strings.escapeShellArg source} >/dev/null
  '';
  text = source: expected: ''
    diff -u ${lib.strings.escapeShellArg source} <(printf '%s' ${lib.strings.escapeShellArg expected})
  '';
in
{
  inherit
    homeFileSource
    homeActivationSource
    json
    text
    ;
}
