{ pnpm_12 }:

# Keep dependency fetching and offline builds on the same pnpm release.
# Regenerate both clients' pnpmDepsHash values when updating this version.
(pnpm_12.override {
  version = "12.6.0";
  srcHash = "sha256-EUDEhOW1KlMPMvFlybj0hU/XoUJSBymQ2n9Hn7G5rMc=";
  cargoHash = "sha256-kXQFesQU66QpBItjyynqFb+DjeMOe/n30mju7A1Svvs=";
}).overrideAttrs
  (old: {
    # Use Nix's vendored Cargo sources instead of pnpm's local source directory.
    postPatch = (old.postPatch or "") + ''
      sed -i '/# >>> pnpm-managed cargo sources >>>/,/# <<< pnpm-managed cargo sources <<</d' .cargo/config.toml
    '';
  })
