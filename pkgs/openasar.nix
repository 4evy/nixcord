{
  fetchFromGitHub,
  openasar,
}:
let
  # TODO: Remove this override once nixos-unstable includes NixOS/nixpkgs@1b489c0d6f537cb18340279fcd2c8972148164ee.
  version = "0-unstable-2026-07-12";
  rev = "5a05f49043d169fe0832e5c5a2e74d08a06f0bd3";
  src = fetchFromGitHub {
    inherit (openasar.src) owner repo;
    inherit rev;
    hash = "sha256-fVOoqdnD2PKmpJKIzjFcGNa5Yg73CvzDH4Y1fu11xVE=";
  };
in
openasar.overrideAttrs {
  inherit version src;
}
