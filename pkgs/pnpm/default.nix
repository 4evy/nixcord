{ pnpm_11 }:

# pnpm changes its store metadata between minor releases. Keep dependency
# fetching and offline builds on the same version across Nixpkgs inputs.
# Regenerate both clients' pnpmDepsHash values when updating this version.
pnpm_11.override {
  version = "11.25.0";
  hash = "sha256-M90HSPJ+eRbE8ci2lDRhmD40U7BrvaYxKmKAEwtIgeU=";
}
