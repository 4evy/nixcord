{
  pkgs,
  openasar,
}:

assert openasar.version == "0-unstable-2026-07-12";
pkgs.runCommand "discord-openasar-check"
  {
    nativeBuildInputs = [ pkgs.asar ];
  }
  ''
    asar extract ${openasar} extracted
    grep -F 'createLogger' extracted/bootstrap.js
    touch "$out"
  ''
