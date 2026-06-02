{
  stdenvNoCC,
  runCommand,
  branch,
  discord,
  discord-ptb,
  discord-canary,
  discord-development,
}:
let
  variantPackages = {
    stable = discord;
    ptb = discord-ptb;
    canary = discord-canary;
    development = discord-development;
  };

  basePackageRaw = variantPackages.${branch};
  basePackageOverride = basePackageRaw.override or null;

  emptyOpenSSL11 = runCommand "openssl-1.1.1w-ignored" { } ''
    mkdir -p "$out/lib"
  '';
  basePackageCanOverrideOpenSSL11 =
    basePackageOverride != null
    && builtins.isFunction basePackageOverride
    && builtins.functionArgs basePackageOverride ? openssl_1_1;
in
if stdenvNoCC.isLinux && basePackageCanOverrideOpenSSL11 then
  basePackageOverride { openssl_1_1 = emptyOpenSSL11; }
else
  basePackageRaw
