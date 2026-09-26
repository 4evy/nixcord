"""Carry usable upstream signing settings into Nixcord's ad-hoc signature."""

import plistlib
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import yaml

USABLE_PREFIXES = (
    "com.apple.security.cs.",
    "com.apple.security.device.",
)
IDENTITY_ENTITLEMENTS = {
    "com.apple.application-identifier",
    "com.apple.developer.associated-domains",
    "com.apple.developer.team-identifier",
    "com.apple.developer.usernotifications.communication",
    "keychain-access-groups",
}
SUPPORTED_FLAGS = {
    "host",
    "hard",
    "kill",
    "expires",
    "library",
    "runtime",
    "linker-signed",
}


def signing_metadata(
    rcodesign: str, executable: Path
) -> list[tuple[dict, tuple[str, ...]]]:
    output = subprocess.check_output(
        [rcodesign, "print-signature-info", str(executable)], text=True
    )
    metadata = []
    for entry in yaml.safe_load(output):
        macho = entry.get("entity", {}).get("mach_o")
        if macho is None:
            continue
        signature = macho["signature"]
        flags_text = signature["code_directory"]["flags"]
        flags_match = re.fullmatch(r"CodeSignatureFlags\(([^)]*)\)", flags_text)
        if flags_match is None:
            raise RuntimeError(f"cannot read code-signature flags from {executable}")
        flags = tuple(
            name.strip().lower().replace("_", "-")
            for name in flags_match.group(1).split("|")
        )
        unsupported_flags = set(flags) - SUPPORTED_FLAGS
        if unsupported_flags:
            raise RuntimeError(
                f"review new upstream signature flags on {executable}: "
                f"{', '.join(sorted(unsupported_flags))}"
            )
        entitlements_xml = "\n".join(signature["entitlements_plist"])
        metadata.append((plistlib.loads(entitlements_xml.encode()), flags))
    return metadata


def carry_entitlements(entitlements: dict, executable: Path) -> dict:
    unknown = sorted(
        key
        for key in entitlements
        if key not in IDENTITY_ENTITLEMENTS and not key.startswith(USABLE_PREFIXES)
    )
    if unknown:
        raise RuntimeError(
            f"review new upstream entitlements on {executable}: {', '.join(unknown)}"
        )
    usable = {
        key: value
        for key, value in entitlements.items()
        if key.startswith(USABLE_PREFIXES)
    }
    # Electron is ad-hoc signed while staged native modules keep their upstream
    # signatures, so the host must be able to load code across identities
    usable["com.apple.security.cs.disable-library-validation"] = True
    return usable


def main() -> None:
    rcodesign = sys.argv[1]
    app = Path(sys.argv[2])
    binary_name = sys.argv[3]

    sources = {
        "main": (f"Contents/MacOS/{binary_name}.unwrapped", None),
    }
    for name, suffix in (
        ("helper", ""),
        ("gpu", " (GPU)"),
        ("plugin", " (Plugin)"),
        ("renderer", " (Renderer)"),
    ):
        helper = f"{binary_name} Helper{suffix}"
        bundle = f"Contents/Frameworks/{helper}.app"
        sources[name] = (f"{bundle}/Contents/MacOS/{helper}", bundle)

    with TemporaryDirectory() as directory:
        command = [
            rcodesign,
            "sign",
            "--config-file",
            "/dev/null",
            "--exclude",
            "Contents/Resources/modules/**",
        ]
        for name, (relative_executable, bundle) in sources.items():
            executable = app / relative_executable
            metadata = signing_metadata(rcodesign, executable)
            if not metadata:
                raise RuntimeError(f"no architectures in {executable}")
            if any(value != metadata[0] for value in metadata[1:]):
                raise RuntimeError(
                    f"upstream signing settings differ by architecture: {executable}"
                )
            entitlements, flags = metadata[0]
            plist = Path(directory) / f"{name}.plist"
            plist.write_bytes(
                plistlib.dumps(carry_entitlements(entitlements, executable))
            )
            command.extend((
                "--entitlements-xml-file",
                f"{bundle}:{plist}" if bundle else str(plist),
            ))
            if bundle is None:
                command.extend((
                    "--entitlements-xml-file",
                    f"{relative_executable}:{plist}",
                ))
            if flags:
                flag_text = ",".join(flags)
                command.extend((
                    "--code-signature-flags",
                    f"{bundle or relative_executable}:{flag_text}",
                ))
                if bundle is None:
                    command.extend((
                        "--code-signature-flags",
                        f"Contents/MacOS/{binary_name}:{flag_text}",
                    ))
        subprocess.run([*command, str(app)], check=True)


if __name__ == "__main__":
    main()
