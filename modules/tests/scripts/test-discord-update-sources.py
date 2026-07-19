#!/usr/bin/env python3

import importlib.util
import json
import os
import pathlib
import sys
import tempfile

sys.dont_write_bytecode = True


def load_updater(path: str):
    spec = importlib.util.spec_from_file_location("discord_update_sources", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load updater from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def main() -> None:
    updater_path = (
        pathlib.Path(sys.argv[1])
        if len(sys.argv) > 1
        else pathlib.Path(__file__).parents[3]
        / "pkgs/discord/scripts/update-sources.py"
    )
    updater = load_updater(str(updater_path))

    assert updater.sri_from_sha256_hex("00" * 32) == (
        "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )

    manifest = {
        "full": {
            "host_version": [1, 2, 3],
            "url": "https://example.invalid/full.distro",
            "package_sha256": "00" * 32,
        },
        "modules": {
            "discord_voice": {
                "full": {
                    "module_version": 7,
                    "url": "https://example.invalid/voice.distro",
                    "package_sha256": "11" * 32,
                }
            }
        },
    }
    updater.fetch_distro_manifest = lambda _variant: manifest
    source = updater.fetch_distro_source(
        updater.Variant(updater.Platform.LINUX, updater.Branch.CANARY)
    )
    assert source.version == "1.2.3"
    assert source.distro.hash == (
        "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )
    assert source.modules["discord_voice"].version == 7

    with tempfile.TemporaryDirectory() as temp_dir:
        sources_path = pathlib.Path(temp_dir, "sources.json")
        original = {
            "linux-stable": {"version": "keep-linux-stable"},
            "linux-canary-krisp": {"version": "obsolete"},
            "osx-canary-krisp": {"version": "obsolete"},
        }
        sources_path.write_text(json.dumps(original), encoding="utf-8")
        os.environ["SOURCES_JSON"] = str(sources_path)
        os.environ["DISCORD_BRANCHES"] = "canary"

        def successful_source(variant):
            return updater.DistroSource(
                version=f"1.2.{3 if variant.platform == updater.Platform.LINUX else 4}",
                distro=updater.DistroRef(
                    url=f"https://example.invalid/{variant.platform}.distro",
                    hash="sha256-test",
                ),
                modules={
                    "discord_voice": updater.DistroModule(
                        version=8,
                        url=f"https://example.invalid/{variant.platform}-voice.distro",
                        hash="sha256-module-test",
                    )
                },
            )

        updater.fetch_distro_source = successful_source
        updater.main()
        updated = json.loads(sources_path.read_text(encoding="utf-8"))

        assert updated["linux-stable"] == original["linux-stable"]
        assert updated["linux-canary"]["version"] == "1.2.3"
        assert updated["osx-canary"]["version"] == "1.2.4"
        assert updated["linux-canary"]["modules"]["discord_voice"]["version"] == 8
        assert "linux-canary-krisp" not in updated
        assert "osx-canary-krisp" not in updated
        assert not pathlib.Path(f"{sources_path}.tmp").exists()

    with tempfile.TemporaryDirectory() as temp_dir:
        sources_path = pathlib.Path(temp_dir, "sources.json")
        original = {"sentinel": {"version": "unchanged"}}
        sources_path.write_text(json.dumps(original), encoding="utf-8")
        os.environ["SOURCES_JSON"] = str(sources_path)
        os.environ["DISCORD_BRANCHES"] = "canary"

        def fail(_variant):
            raise RuntimeError("simulated manifest failure")

        updater.fetch_distro_source = fail
        try:
            updater.main()
        except RuntimeError as error:
            assert str(error) == "simulated manifest failure"
        else:
            raise AssertionError("updater did not propagate a manifest failure")
        assert json.loads(sources_path.read_text(encoding="utf-8")) == original

    os.environ["DISCORD_BRANCHES"] = "unknown"
    try:
        updater.selected_variants()
    except SystemExit as error:
        assert str(error) == "Unknown Discord branches: unknown"
    else:
        raise AssertionError("updater accepted an unknown branch")


if __name__ == "__main__":
    main()
