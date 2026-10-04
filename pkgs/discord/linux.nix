{
  common,
  binaryName,
  desktopName,
  layout,
  moduleSrcs,
  stageModules,
  commandLineArgs,
  hasDeployKrisp,
  deployKrisp,
  withTTS ? true,
  enableAutoscroll ? false,
  lib,
  stdenv,
  makeShellWrapper,
  gtk3,
  brotli,
  addDriverRunpath,
  makeDesktopItem,
  autoPatchelfHook,
  cups,
  libdrm,
  libuuid,
  libxdamage,
  libx11,
  libxscrnsaver,
  libxtst,
  libxcb,
  libxshmfence,
  wrapGAppsHook3,
  alsa-lib,
  libgbm,
  nspr,
  nss,
  libpulseaudio,
  libcxx,
  systemdLibs,
  atk,
  at-spi2-atk,
  at-spi2-core,
  cairo,
  dbus,
  expat,
  fontconfig,
  freetype,
  gdk-pixbuf,
  glib,
  libglvnd,
  libnotify,
  libxcomposite,
  libunity,
  libva,
  libxcursor,
  libxext,
  libxfixes,
  libxi,
  libxrandr,
  libxrender,
  libxkbcommon,
  pango,
  pipewire,
  libappindicator,
  libdbusmenu,
  wayland,
  speechd-minimal,
}:
let
  commandLineArgsString =
    if builtins.isList commandLineArgs then
      lib.strings.escapeShellArgs commandLineArgs
    else
      commandLineArgs;
in
stdenv.mkDerivation (
  finalAttrs:
  common
  // {
    inherit stageModules;

    runtimeLibraries = [
      libcxx
      systemdLibs
      libpulseaudio
      libdrm
      libgbm
      alsa-lib
      atk
      at-spi2-atk
      at-spi2-core
      cairo
      cups
      dbus
      expat
      fontconfig
      freetype
      gdk-pixbuf
      glib
      gtk3
      libglvnd
      libnotify
      libx11
      libxcomposite
      libunity
      libuuid
      libva
      libxcursor
      libxdamage
      libxext
      libxfixes
      libxi
      libxrandr
      libxrender
      libxtst
      nspr
      libxcb
      libxkbcommon
      pango
      pipewire
      libxscrnsaver
      libappindicator
      libdbusmenu
      wayland
      stdenv.cc.cc
    ]
    ++ lib.optionals withTTS [ speechd-minimal ];

    # Keep NSS out of LD_LIBRARY_PATH so xdg-open cannot leak an incompatible
    # version into Firefox children; autoPatchelf finds it through buildInputs
    libPath = lib.makeLibraryPath finalAttrs.runtimeLibraries;

    nativeBuildInputs = [
      makeShellWrapper
      brotli
      autoPatchelfHook
      wrapGAppsHook3
    ];

    buildInputs = finalAttrs.runtimeLibraries ++ [
      nss
      libxshmfence
    ];

    strictDeps = true;
    dontWrapGApps = true;

    # The unused discord_dispatch module still links against OpenSSL 1.1
    autoPatchelfIgnoreMissingDeps = [
      "libssl.so.1.1"
      "libcrypto.so.1.1"
    ];

    installPhase = ''
      runHook preInstall

      mkdir -p "$out/bin" "$out/${layout.appDir}" "$out/share/icons/hicolor/256x256/apps"

      brotli -d < $src | tar xf - --strip-components=1 -C "$out/${layout.appDir}"
      chmod +x "$out/${layout.executable}"

      ${lib.strings.concatMapAttrsStringSep "\n" (name: src: ''
        mkdir -p "$out/${layout.modulesDir}/${name}"
        brotli -d < ${src} | tar xf - --strip-components=1 -C "$out/${layout.modulesDir}/${name}"
      '') moduleSrcs}

      mkdir -p "$out/${layout.modulesDir}/discord_krisp/KMS/logs"

      ln -s "$out/${layout.executable}" $out/bin/
      # Preserve support for case-insensitive build filesystems
      ln -s "$out/${layout.executable}" $out/bin/${lib.strings.toLower binaryName} || true
      ln -s "$out/${layout.appDir}/discord.png" $out/share/icons/hicolor/256x256/apps/${common.pname}.png
      ln -s "$desktopItem/share/applications" $out/share/

      runHook postInstall
    '';

    # GApps prepares its wrapper arguments in preFixupPhases
    postFixup = ''
      wrapProgramShell "$out/${layout.executable}" \
        "''${gappsWrapperArgs[@]}" \
        --run 'case ":''${XDG_CURRENT_DESKTOP:-}:" in *:KDE:*) discordKdeWayland=1 ;; *) unset discordKdeWayland ;; esac' \
        --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform=wayland --enable-features=WaylandWindowDecorations --enable-wayland-ime=true}}" \
        --add-flags "\''${WAYLAND_DISPLAY:+\''${discordKdeWayland:+--force-device-scale-factor=1}}" \
        ${lib.strings.optionalString withTTS ''
          --run 'if [[ "''${NIXOS_SPEECH:-default}" != "False" ]]; then NIXOS_SPEECH=True; else unset NIXOS_SPEECH; fi' \
          --add-flags "\''${NIXOS_SPEECH:+--enable-speech-dispatcher}" \
        ''} \
        ${lib.strings.optionalString enableAutoscroll "--add-flags \"--enable-blink-features=MiddleClickAutoscroll\""} \
        --prefix XDG_DATA_DIRS : "${gtk3}/share/gsettings-schemas/${gtk3.name}/" \
        --prefix LD_LIBRARY_PATH : "$out/${layout.appDir}:${addDriverRunpath.driverLink}/lib" \
        --prefix LD_LIBRARY_PATH : ${finalAttrs.libPath} \
        --suffix VK_ADD_DRIVER_FILES : "${addDriverRunpath.driverLink}/share/vulkan/icd.d" \
        --run "${finalAttrs.stageModules} $out/${layout.modulesDir}" \
        --run '[ -t 1 ] || exec > /dev/null 2>&1' \
        --add-flags ${lib.escapeShellArg commandLineArgsString}
    ''
    + lib.strings.optionalString hasDeployKrisp ''
      # Deploy before staging, outside the launcher's library environment
      wrapProgramShell "$out/${layout.executable}" \
        --run ${lib.strings.escapeShellArg (lib.meta.getExe deployKrisp)}
    '';

    desktopItem = makeDesktopItem {
      name = common.pname;
      exec = binaryName;
      icon = common.pname;
      inherit desktopName;
      comment = common.meta.description;
      genericName = "Instant Messenger";
      categories = [
        "Network"
        "InstantMessaging"
      ];
      mimeTypes = [ "x-scheme-handler/discord" ];
      startupWMClass = "discord";
    };
  }
)
