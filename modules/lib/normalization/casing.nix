{ lib }:
let
  toSnakeCase =
    str:
    lib.trivial.pipe str [
      (lib.strings.splitStringBy (_prev: curr: builtins.match "[A-Z]" curr != null) true)
      (lib.lists.filter (part: part != ""))
      (map lib.strings.toLower)
      (lib.strings.concatStringsSep "_")
    ];

in
{
  inherit toSnakeCase;
}
