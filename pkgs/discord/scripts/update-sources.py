#!/usr/bin/env python3
"""Refresh pkgs/discord/data/sources.json with the latest Discord builds.

Adapted from upstream nixpkgs (NixOS/nixpkgs PR #506089). Honors the
DISCORD_BRANCHES env var (comma-separated) for targeted refreshes without
churning unrelated entries.
"""

import base64
import json
import os
import os.path
import sys
import urllib.request
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import List

# The distributions API rejects requests that don't send a Discord-Updater
# User-Agent.
DISTRO_USER_AGENT = "Discord-Updater/1"


class Platform(StrEnum):
    LINUX = "linux"
    MACOS = "osx"


class Branch(StrEnum):
    STABLE = "stable"
    PTB = "ptb"
    CANARY = "canary"
    DEVELOPMENT = "development"


@dataclass(frozen=True)
class Variant:
    platform: Platform
    branch: Branch


@dataclass
class DistroRef:
    url: str
    hash: str


@dataclass
class DistroModule:
    version: int
    url: str
    hash: str


@dataclass
class DistroSource:
    version: str
    distro: DistroRef
    modules: dict = field(default_factory=dict)
    kind: str = "distro"


def serialize_variant(variant: Variant) -> str:
    return f"{variant.platform}-{variant.branch}"


def distro_manifest_url_for_variant(variant: Variant) -> str:
    return (
        f"https://updates.discord.com/distributions/app/manifests/latest"
        f"?channel={variant.branch.value}&platform={variant.platform.value}&arch=x64"
    )


def fetch_distro_manifest(variant: Variant) -> dict:
    url = distro_manifest_url_for_variant(variant)
    req = urllib.request.Request(url, headers={"User-Agent": DISTRO_USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read())


def version_triple_to_str(triple: list) -> str:
    return ".".join(str(x) for x in triple)


def sri_from_sha256_hex(hex_hash: str) -> str:
    return "sha256-" + base64.b64encode(bytes.fromhex(hex_hash)).decode("utf-8")


def fetch_distro_source(variant: Variant) -> DistroSource:
    manifest = fetch_distro_manifest(variant)

    distro_url = manifest["full"]["url"]
    modules = {
        name: DistroModule(
            version=mod["full"]["module_version"],
            url=mod["full"]["url"],
            hash=sri_from_sha256_hex(mod["full"]["package_sha256"]),
        )
        for name, mod in manifest["modules"].items()
    }

    return DistroSource(
        version=version_triple_to_str(manifest["full"]["host_version"]),
        distro=DistroRef(
            url=distro_url,
            hash=sri_from_sha256_hex(manifest["full"]["package_sha256"]),
        ),
        modules=modules,
    )


# Discord now ships all tracked branches and platforms through the distro API.
ALL_VARIANTS: List[Variant] = [
    Variant(Platform.LINUX, Branch.STABLE),
    Variant(Platform.LINUX, Branch.PTB),
    Variant(Platform.LINUX, Branch.CANARY),
    Variant(Platform.LINUX, Branch.DEVELOPMENT),
    Variant(Platform.MACOS, Branch.STABLE),
    Variant(Platform.MACOS, Branch.PTB),
    Variant(Platform.MACOS, Branch.CANARY),
    Variant(Platform.MACOS, Branch.DEVELOPMENT),
]


def selected_variants() -> List[Variant]:
    raw = os.environ.get("DISCORD_BRANCHES", "").strip()
    if not raw:
        return ALL_VARIANTS
    wanted = {b.strip() for b in raw.split(",") if b.strip()}
    valid = {branch.value for branch in Branch}
    unknown = wanted - valid
    if unknown:
        raise SystemExit(f"Unknown Discord branches: {', '.join(sorted(unknown))}")
    return [v for v in ALL_VARIANTS if v.branch.value in wanted]


def find_sources_json() -> str:
    """Locate sources.json. Prefer SOURCES_JSON, then repo-local defaults."""
    explicit = os.environ.get("SOURCES_JSON")
    if explicit:
        return explicit
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "..", "data", "sources.json"),
        "pkgs/discord/data/sources.json",
        "sources.json",
    ]
    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)
    cwd = os.path.abspath(os.getcwd())
    while cwd != "/":
        candidate = os.path.join(cwd, "pkgs", "discord", "data", "sources.json")
        if os.path.isfile(candidate):
            return candidate
        cwd = os.path.dirname(cwd)
    raise SystemExit(
        "Error: could not find pkgs/discord/data/sources.json "
        "(set SOURCES_JSON to override)"
    )


def main() -> None:
    sources_path = find_sources_json()

    try:
        with open(sources_path) as f:
            sources = json.load(f)
    except FileNotFoundError:
        sources = {}

    variants = selected_variants()
    if not variants:
        print("No matching branches selected; nothing to do.", file=sys.stderr)
        return

    updated_sources = sources.copy()
    for v in variants:
        key = serialize_variant(v)
        print(f"Fetching {key} (distro)...")
        source = fetch_distro_source(v)
        updated_sources[key] = asdict(source)
        print(f"  -> version {source.version}")

    for v in variants:
        key = serialize_variant(v)
        if key not in updated_sources:
            continue
        # Distro builds embed krisp inside source.modules.
        updated_sources.pop(f"{key}-krisp", None)

    temporary_path = f"{sources_path}.tmp"
    try:
        with open(temporary_path, "w") as f:
            json.dump(updated_sources, f, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(temporary_path, sources_path)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
    print(f"Wrote {sources_path}")


if __name__ == "__main__":
    main()
