{ pkgs }:

let
  inherit (pkgs) lib;
  patchStockUpdater = pkgs.callPackage ../../pkgs/discord/patching/updater/default.nix { };
  vencord = pkgs.writeTextDir "patcher.js" ''
    require('node:fs').writeFileSync(process.env.MOD_MARKER, __filename);
  '';
  equicord = pkgs.writeTextDir "desktop/patcher.js" ''
    require('node:fs').writeFileSync(process.env.MOD_MARKER, __filename);
  '';
  krispModule = pkgs.writeTextDir "index.js" ''
    require('node:fs').writeFileSync(process.env.KRISP_MARKER, __filename);
  '';
  runCase =
    {
      name,
      withOpenASAR ? false,
      mod ? null,
      hasKrispModule ? false,
    }:
    let
      resourcesDir = "$out/${name}/Discord App/resources";
      modulesDir = "$out/${name}/Discord App/modules";
      hostName = if mod == null then "app.asar" else "_app.asar";
      installer = import ../../pkgs/discord/install.nix {
        inherit
          lib
          patchStockUpdater
          resourcesDir
          modulesDir
          withOpenASAR
          mod
          hasKrispModule
          krispModule
          ;
        inherit (pkgs) python3 asar;
        openasar = "./openasar.asar";
        patchVoiceKrispPy = ../../pkgs/discord/krisp/patch/voice.py;
        krispRuntimePath = "require('path').join(process.env.TEST_MODULES, 'discord_krisp')";
      };
    in
    ''
      resources="${resourcesDir}"
      modules="${modulesDir}"
      mkdir -p "$resources" "$modules/discord_voice" "$modules/discord_krisp"
      cp stock.asar "$resources/app.asar"
      cp build_info.json "$resources/build_info.json"
      cp voice.js "$modules/discord_voice/index.js"
      printf 'obsolete module\n' > "$modules/discord_krisp/obsolete"

      ${installer}

      node check-build-info.cjs "$resources/build_info.json"
      asar extract "$resources/${hostName}" "${name}-host"
      ${
        if withOpenASAR then
          ''
            cmp openasar.asar "$resources/${hostName}"
            node "${name}-host/bundle.js"
          ''
        else
          ''
            cmp host/preserved.txt "${name}-host/preserved.txt"
            node check-updater.cjs "$PWD/${name}-host/bundle.js"
          ''
      }
      ${
        if mod == null then
          ''
            test -f "$resources/app.asar"
            test ! -e "$resources/_app.asar"
          ''
        else
          ''
            export MOD_MARKER="$PWD/${name}-mod-marker"
            node "$resources/app.asar"
            node - "$MOD_MARKER" ${lib.strings.escapeShellArg mod.patcher} <<'JS'
            const assert = require('node:assert/strict');
            const fs = require('node:fs');
            assert.equal(fs.readFileSync(process.argv[2], 'utf8'), process.argv[3]);
            JS
          ''
      }
      ${
        if hasKrispModule then
          ''
            test ! -e "$modules/discord_krisp/obsolete"
            test ! -L "$modules/discord_krisp"
            test -w "$modules/discord_krisp/index.js"
            cmp ${krispModule}/index.js "$modules/discord_krisp/index.js"
            export TEST_MODULES="$modules"
            export KRISP_MARKER="$PWD/${name}-krisp-marker"
            node check-voice.cjs "$modules/discord_voice/index.js"
          ''
        else
          ''
            cmp voice.js "$modules/discord_voice/index.js"
            test -f "$modules/discord_krisp/obsolete"
          ''
      }
    '';
in
pkgs.runCommand "discord-install-test"
  {
    nativeBuildInputs = [
      pkgs.asar
      pkgs.nodejs
    ];
  }
  ''
    set -euo pipefail

    mkdir host openasar-host
    cat > host/bundle.js <<'JS'
    const factories = {
      731(module, exports) {
        const logFile = 'legacyModulesUpdater.log';
        let updatable;
        let hostUpdatable;
        exports.init = function () {
          updatable = true;
          hostUpdatable = true;
        };
        exports.flags = () => ({ updatable, hostUpdatable });
        exports.CHECKING_FOR_UPDATES = 'checking';
        exports.UPDATE_CHECK_FINISHED = 'checked';
        exports.INSTALLED_MODULE = 'installed';
        exports.NO_PENDING_UPDATES = 'no-pending';
        exports.recordedEvents = [];
        exports.events = { append: event => exports.recordedEvents.push(event) };
        exports.isInstalled = (name, version) => name === 'core' && version === 7;
        exports.checkForUpdates = () => { throw new Error('network check attempted'); };
        exports.install = () => { throw new Error('module download attempted'); };
        exports.installPendingUpdates = () => { throw new Error('pending update applied'); };
      }
    };
    factories[731](module, module.exports);
    JS
    printf 'unrelated host payload\n' > host/preserved.txt
    printf 'module.exports = "OpenASAR fixture";\n' > openasar-host/bundle.js
    asar pack host stock.asar
    asar pack openasar-host openasar.asar

    cat > build_info.json <<'JSON'
    {"releaseChannel":"canary","version":"0.0.123","disableUpdater":false,"custom":{"enabled":true,"values":[1,"two",null]}}
    JSON
    cat > check-build-info.cjs <<'JS'
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const original = JSON.parse(fs.readFileSync('build_info.json', 'utf8'));
    const installed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    assert.deepEqual(installed, { ...original, disableUpdater: true });
    JS

    cat > check-updater.cjs <<'JS'
    const assert = require('node:assert/strict');
    const updater = require(process.argv[2]);
    updater.init();
    assert.deepEqual(updater.flags(), { updatable: false, hostUpdatable: false });
    assert.equal(updater.isInstalled('core', 7), true);
    assert.equal(updater.isInstalled('core', 8), false);
    updater.checkForUpdates();
    assert.deepEqual(updater.recordedEvents.splice(0), [
      { type: 'checking' },
      { type: 'checked', succeeded: true, updateCount: 0, manualRequired: false }
    ]);
    updater.install('core', false, { version: 7 });
    updater.install('core', false, { version: 8 });
    updater.install('missing', false);
    assert.deepEqual(updater.recordedEvents.splice(0), [
      { type: 'installed', name: 'core', current: 1, total: 1, succeeded: true },
      { type: 'installed', name: 'core', current: 1, total: 1, succeeded: false },
      { type: 'installed', name: 'missing', current: 1, total: 1, succeeded: false }
    ]);
    updater.install('core', true, { version: 7 });
    assert.deepEqual(updater.recordedEvents, []);
    updater.installPendingUpdates();
    assert.deepEqual(updater.recordedEvents, [{ type: 'no-pending' }]);
    JS

    cat > voice.js <<'JS'
    const VoiceEngine = {
      paths: [],
      setKrispPath(path) { this.paths.push(path); }
    };
    const discordNative = {
      nativeModules: {
        getModulePath() { throw new Error('unmanaged Krisp lookup attempted'); }
      }
    };
    VoiceEngine.setupKrispPath = function () {
        const krispPath = discordNative?.nativeModules?.getModulePath('discord_krisp');
        if (krispPath != null) {
            VoiceEngine.setKrispPath(krispPath);
        }
    };
    module.exports = VoiceEngine;
    JS
    cat > check-voice.cjs <<'JS'
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const voice = require(process.argv[2]);
    const krispPath = path.join(process.env.TEST_MODULES, 'discord_krisp');
    assert.deepEqual(voice.paths, [krispPath]);
    voice.setupKrispPath();
    assert.deepEqual(voice.paths, [krispPath, krispPath]);
    assert.equal(
      fs.readFileSync(process.env.KRISP_MARKER, 'utf8'),
      path.join(krispPath, 'index.js')
    );
    JS

    ${runCase { name = "stock"; }}
    ${runCase {
      name = "openasar";
      withOpenASAR = true;
    }}
    ${runCase {
      name = "vencord-stock";
      mod = {
        patcher = "${vencord}/patcher.js";
        dataDirEnv = "VENCORD_USER_DATA_DIR";
        dataDirSuffix = "/Library/Application Support/Vencord";
      };
      hasKrispModule = true;
    }}
    ${runCase {
      name = "equicord-openasar";
      withOpenASAR = true;
      mod = {
        patcher = "${equicord}/desktop/patcher.js";
        dataDirEnv = "EQUICORD_USER_DATA_DIR";
        dataDirSuffix = "/Library/Application Support/Equicord";
      };
      hasKrispModule = true;
    }}
  ''
