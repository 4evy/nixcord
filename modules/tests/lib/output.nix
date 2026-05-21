{ lib }:

let
  homeActivationData =
    activation:
    if builtins.isAttrs activation && activation ? data then activation.data else activation;

  homeActivationHereDoc =
    config: activationName:
    let
      script = homeActivationData config.home.activation.${activationName};
      marker = ''cat > "$dest" <<'EOF'';
      findPayload =
        lines:
        if lines == [ ] then
          throw "activation ${activationName} does not write a heredoc"
        else if lib.hasInfix marker (builtins.head lines) then
          builtins.head (builtins.tail lines)
        else
          findPayload (builtins.tail lines);
    in
    findPayload (lib.splitString "\n" script);
in
{
  homeFileJSON = config: path: builtins.fromJSON (builtins.getAttr path config.home.file).text;

  homeActivationInstallJSON =
    config: activationName:
    builtins.fromJSON (
      builtins.unsafeDiscardStringContext (homeActivationHereDoc config activationName)
    );

  serializeEvalConfig =
    { evaluatedConfig, pluginName }:
    let
      nixcordCfg = evaluatedConfig.programs.nixcord;
    in
    builtins.toJSON {
      inherit (nixcordCfg)
        enable
        user
        configDir
        quickCss
        ;
      pluginEnabled = nixcordCfg.config.plugins.${pluginName}.enable;
      assertions = evaluatedConfig.assertions;
      warnings = evaluatedConfig.warnings;
    };
}
