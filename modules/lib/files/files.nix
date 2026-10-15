# Compose generated resources and their installation specifications
{ lib }:
(import ./specs.nix { inherit lib; }) // (import ./settings.nix { inherit lib; })
