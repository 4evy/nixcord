{ fetchPnpmDeps }:
args:
(fetchPnpmDeps args).overrideAttrs (oldAttrs: {
  preFixup = (oldAttrs.preFixup or "") + ''
    # Keep SQLite 3.53 blob literals compatible with existing dependency hashes
    sqlite3() {
      command sqlite3 "$@" | sed "s/,x'/,X'/g"
    }
  '';
})
