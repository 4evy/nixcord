{ callPackage, lib }:
(callPackage ../bun/fetch-deps.nix { }) {
  name = "plugin-generator-bun-deps";
  src = import ../../nix/workspace-source.nix { inherit lib; };
  hash = "sha256-QnwPZ1uPQPFHyYLlWQwy6XsEhAM2xTYcNzv+VkY2QDk=";
}
