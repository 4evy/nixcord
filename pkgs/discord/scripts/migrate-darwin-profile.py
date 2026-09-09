"""Copy a legacy Discord profile before anything writes to its new location."""

# TODO(2026-09-21): Remove this helper, prepareData in pkgs/discord/default.nix,
# the prepare_data installer argument/substitution, PREPARE_DATA and its C helpers entry,
# migrateDiscordProfiles in modules/lib/activation.nix, and the HM writable-file
# dependency on disableDiscordUpdates. Keep the new profile path and C env setup.
# Also remove the migration cases in modules/tests/c/discord-launcher.nix and
# migratingScripts plus its checks in modules/tests/activation-scripts.nix.
# Users who skip the migration release will still need to copy profiles manually.

import argparse
import fcntl
import os
import shutil
import stat
import sys
import tempfile
from contextlib import suppress
from pathlib import Path


def copy_profile(source: Path, destination: Path, new: Path) -> None:
    # copytree also copies directory metadata. Keep fresh, private directories
    # and copy only file contents and modes, without extended attributes.
    def on_error(error: OSError) -> None:
        raise error

    for directory, dirs, files in source.walk(on_error=on_error):
        if directory == source:
            for names in (dirs, files):
                names[:] = [name for name in names if not name.startswith("Singleton")]
        target_directory = destination / directory.relative_to(source)
        target_directory.mkdir(mode=0o700)
        # Path.walk lists symlinks (including directory symlinks) in files.
        for name in files:
            src = directory / name
            dst = target_directory / name
            mode = src.lstat().st_mode
            if stat.S_ISLNK(mode):
                target = src.readlink()
                if target.is_absolute() and target.is_relative_to(source):
                    target = new / target.relative_to(source)
                dst.symlink_to(target)
            elif stat.S_ISREG(mode):
                shutil.copyfile(src, dst)
                dst.chmod(stat.S_IMODE(mode) | stat.S_IWUSR)
            else:
                raise RuntimeError(f"cannot migrate special file: {src}")


def migrate(source: Path, destination: Path) -> None:
    source = source.absolute()
    destination = destination.absolute()
    if source == destination:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Both activation and a launch can initiate migration. Publish the completed
    # copy atomically, under the same lock, and never merge into an active profile.
    lock = destination.parent / f".{destination.name}-migration.lock"
    with open(
        lock, "a", opener=lambda path, flags: os.open(path, flags, 0o600)
    ) as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        with suppress(FileNotFoundError):
            destination.lstat()
            if not destination.is_dir():
                raise RuntimeError(
                    f"profile destination is not a directory: {destination}"
                )
            return
        try:
            source.lstat()
        except FileNotFoundError:
            destination.mkdir(mode=0o700)
            return
        if source.is_symlink():
            source = source.resolve(strict=True)
        if destination.resolve().is_relative_to(source.resolve()):
            raise RuntimeError("the new profile must be outside the legacy profile")
        singleton = source / "SingletonLock"
        if singleton.is_symlink():
            try:
                pid = int(os.readlink(singleton).rsplit("-", 1)[1])
                if pid <= 0:
                    raise ValueError("invalid process ID")
                os.kill(pid, 0)
            except ProcessLookupError:
                pass
            except (ValueError, IndexError, PermissionError) as error:
                raise RuntimeError(
                    "quit Discord before migrating its profile"
                ) from error
            else:
                raise RuntimeError("quit Discord before migrating its profile")
        with tempfile.TemporaryDirectory(
            prefix=f".{destination.name}-migration-", dir=destination.parent
        ) as temporary:
            staged = Path(temporary) / "profile"
            copy_profile(source, staged, destination)
            staged.rename(destination)
        print(f"Nixcord: copied {source} to {destination}; the original is unchanged")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="legacy profile directory")
    parser.add_argument("destination", type=Path, help="new profile directory")
    args = parser.parse_args()
    try:
        migrate(args.source, args.destination)
    except (OSError, RuntimeError) as error:
        print(f"Nixcord: profile migration failed: {error}", file=sys.stderr)
        print(
            "Quit Discord and retry. On macOS 27, if access is denied, allow the "
            "launching app or terminal to read Discord's data in System Settings > "
            "Privacy & Security, then retry. The original profile is unchanged.",
            file=sys.stderr,
        )
        sys.exit(1)
