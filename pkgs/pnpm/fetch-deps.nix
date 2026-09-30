{ fetchPnpmDeps }:
args:
(fetchPnpmDeps args).overrideAttrs (oldAttrs: {
  preFixup = (oldAttrs.preFixup or "") + ''
    # Omit pnpm's empty Darwin clone probe directory to match Linux archives
    if [ -d "$storePath/v11/links" ]; then
      find "$storePath/v11/links" -maxdepth 0 -type d -empty -delete
    fi

    # Keep SQLite 3.53 blob literals compatible with existing dependency hashes
    sqlite3() {
      command sqlite3 "$@" | sed "s/,x'/,X'/g"
    }
  '';
})
