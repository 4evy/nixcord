#!/usr/bin/env python3
"""Describe the final workflow payload using short subjects and concrete details.

Lead with package/channel updates, then summarize supporting changes. Name small
changes; count large ones. Never infer an upstream rationale from generated data.
"""

import argparse
import json
import re
import subprocess
from collections import defaultdict
from itertools import chain
from pathlib import Path
from textwrap import TextWrapper

CLIENTS = {"equicord": "Equicord", "vencord": "Vencord", "goofcord": "GoofCord"}


def before(path):
    entry = subprocess.check_output(
        ["git", "ls-tree", "HEAD", "--", path],
        stderr=subprocess.PIPE,
        text=True,
    )
    if not entry:
        return None
    return subprocess.check_output(
        ["git", "show", f"HEAD:{path}"],
        stderr=subprocess.PIPE,
        text=True,
    )


def assignment(source, name):
    match = re.search(rf'\b{re.escape(name)}\s*=\s*"([^"\n]+)";', source)
    return match[1] if match else None


def join_names(names):
    names = list(names)
    if len(names) < 2:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def names_hint(names):
    names = sorted(names)
    shown = ", ".join(names[:3])
    return shown + (f", and {len(names) - 3} more" if len(names) > 3 else "")


def delta(left, right):
    return (
        sorted(right.keys() - left.keys()),
        sorted(left.keys() - right.keys()),
        sorted(key for key in left.keys() & right.keys() if left[key] != right[key]),
    )


def describe_entries(left, right, noun):
    parts = []
    for verb, names in zip(
        ("add", "remove", "update"), delta(left, right), strict=True
    ):
        if names:
            plural = "entries" if noun == "entry" else noun + "s"
            parts.append(
                f"{verb} {len(names)} {noun if len(names) == 1 else plural} "
                f"({names_hint(names)})"
            )
    return "; ".join(parts) or "reformat entries"


def grouped_entries(data):
    """Keep migration/parse-rule records intact instead of counting sections."""
    entries = {}
    for group, records in data.items():
        if isinstance(records, dict):
            items = records.items()
        elif isinstance(records, list):
            items = (
                (
                    record.get("from", record) if isinstance(record, dict) else record,
                    record,
                )
                for record in records
            )
        else:
            items = [(group, records)]
        for key, value in items:
            if not isinstance(key, str):
                key = json.dumps(key, sort_keys=True, separators=(",", ":"))
            entries[f"{group}/{key}"] = value
    return entries


def message(scope, subject, lines):
    # Wrap prose for terminal readers without splitting paths, IDs, or versions
    wrapper = TextWrapper(
        width=80,
        initial_indent="- ",
        subsequent_indent="  ",
        break_long_words=False,
        break_on_hyphens=False,
    )
    body = "\n".join(map(wrapper.fill, lines))
    return {"headline": f"{scope}: {subject}", "body": body}


def metadata_summary(path, old, new):
    label = {
        "deprecated": "Deprecations",
        "migrations": "Migrations",
        "parse-rules": "Parse rules",
        "shared": "Shared plugin options",
        "equicord": "Equicord options",
        "vencord": "Vencord options",
    }.get(Path(path).stem, path)
    left, right = json.loads(old), json.loads(new)
    grouped = Path(path).stem in {"deprecated", "migrations", "parse-rules"}
    if grouped:
        left, right = grouped_entries(left), grouped_entries(right)
    added, removed, changed = delta(left, right)
    if (
        Path(path).stem == "deprecated"
        and changed
        and not added
        and not removed
        and all(
            isinstance(left[key], dict)
            and isinstance(right[key], dict)
            and left[key].get("date") != right[key].get("date")
            and {k: v for k, v in left[key].items() if k != "date"}
            == {k: v for k, v in right[key].items() if k != "date"}
            for key in changed
        )
    ):
        count = len(changed)
        subject = f"refresh {count} deprecation date{'s' if count != 1 else ''}"
        lines = []
        dates = defaultdict(list)
        for key in changed:
            dates[str(left[key].get("date")), str(right[key].get("date"))].append(key)
        for (old_date, new_date), names in sorted(dates.items()):
            lines.append(
                f"Deprecation dates: {old_date} -> {new_date} ({names_hint(names)})"
            )
        return subject, lines
    noun = "entry" if grouped else "plugin"
    detail = describe_entries(left, right, noun)
    subject = f"refresh {label[0].lower() + label[1:]}"
    if label.startswith(("Equicord", "Vencord")):
        subject = f"refresh {label}"
    return subject, [f"{label}: {detail}"]


def lock_summary(old, new):
    try:
        left, right = json.loads(old), json.loads(new)
    except json.JSONDecodeError:
        return "refresh npm lockfile", ["npm lockfile: update contents"]
    # npm includes root and workspace packages alongside installed dependencies.
    old_packages, new_packages = (
        {path or "(root)": entry for path, entry in data.pop("packages", {}).items()}
        for data in (left, right)
    )
    added, removed, changed = delta(old_packages, new_packages)
    if len(removed) == 1 and not added and not changed and left == right:
        subject = f"remove {removed[0]} from npm lockfile"
        if len(f"plugins: {subject}") <= 72:
            return subject, [f"npm lockfile: remove {removed[0]}"]
    lines = []
    if added or removed or changed:
        lines.append(
            "npm lockfile: " + describe_entries(old_packages, new_packages, "package")
        )
    settings = sorted(
        k for k in left.keys() | right.keys() if left.get(k) != right.get(k)
    )
    if settings:
        lines.append(f"npm lockfile: update settings ({join_names(settings)})")
    return "refresh npm lockfile", lines or ["npm lockfile: reformat entries"]


def hash_summary(old, new):
    pattern = re.compile(r'([\w-]+)\s*=\s*"(sha256-[^"\n]+)";')
    left, right = dict(pattern.findall(old)), dict(pattern.findall(new))
    names = sorted(chain.from_iterable(delta(left, right)))
    if not names or pattern.sub("HASH", old) != pattern.sub("HASH", new):
        return None
    return names


def package_summary(client, old, new):
    label = CLIENTS[client] + (" Darwin dependencies" if client == "goofcord" else "")
    old_version, new_version = assignment(old, "version"), assignment(new, "version")
    old_rev, new_rev = assignment(old, "rev"), assignment(new, "rev")
    if old_version and new_version and old_version != new_version:
        return (
            "package",
            f"update {label}",
            [f"{label}: {old_version} -> {new_version}"],
        )
    if old_rev and new_rev and old_rev != new_rev:
        return (
            "package",
            f"update {label}",
            [f"{label}: revision {old_rev[:12]} -> {new_rev[:12]}"],
        )
    hashes = hash_summary(old, new)
    if not hashes:
        return (
            "dependencies",
            f"refresh {label} package definition",
            [f"{label}: refresh package definition"],
        )
    if client == "goofcord":
        return (
            "dependencies",
            "refresh GoofCord Darwin dependency hashes",
            [f"GoofCord Darwin dependency hashes: {join_names(hashes)}"],
        )
    # The top-level hash pins source archives; pnpmDepsHash pins dependencies
    # Calling both dependency hashes would mislabel source-only refreshes
    fields = {"hash": "source hash", "pnpmDepsHash": "pnpm dependency hash"}
    labels = [fields.get(name, name) for name in hashes]
    subject = f"refresh {label} " + (
        labels[0] if len(labels) == 1 else "source and dependency hashes"
    )
    return "dependencies", subject, [f"{label}: refresh {join_names(labels)}"]


def plugin_message(paths):
    summaries, clients = [], []
    for path in paths:
        old = before(path)
        new = Path(path).read_text() if Path(path).is_file() else None
        if old is None or new is None:
            action = "add" if new is not None else "remove"
            summaries.append(
                ("other", f"{action} {path}", [f"{action.capitalize()} {path}"])
            )
            continue
        client = next(
            (name for name in CLIENTS if path == f"pkgs/{name}/default.nix"), None
        )
        if client:
            category, subject, lines = package_summary(client, old, new)
            if category == "package":
                clients.append(
                    CLIENTS[client]
                    + (" Darwin dependencies" if client == "goofcord" else "")
                )
            summaries.append((category, subject, lines))
        elif path.startswith("modules/plugins/") and path.endswith(".json"):
            subject, lines = metadata_summary(path, old, new)
            summaries.append(("configuration", subject, lines))
        elif path == "package-lock.json":
            subject, lines = lock_summary(old, new)
            summaries.append(("dependencies", subject, lines))
        elif path == "package.json":
            left, right = json.loads(old), json.loads(new)
            lines = []
            for field, label in (
                ("dependencies", "Dependencies"),
                ("devDependencies", "Development dependencies"),
            ):
                old_requirements = left.pop(field, None)
                new_requirements = right.pop(field, None)
                if old_requirements != new_requirements:
                    lines.append(
                        f"{label}: "
                        + describe_entries(
                            old_requirements or {},
                            new_requirements or {},
                            "requirement",
                        )
                    )
            if left != right:
                lines.append("Package manifest: update workspace settings")
            summaries.append(
                (
                    "dependencies",
                    "refresh workspace dependencies",
                    lines or ["Package manifest: reformat entries"],
                )
            )
        elif path in ("pkgs/generate-options/node-modules.nix", "docs/site.nix"):
            label = "Generator" if path.startswith("pkgs/") else "Docs"
            hashes = hash_summary(old, new)
            subject = (
                f"refresh {label.lower()} dependency hashes"
                if hashes
                else f"refresh {label.lower()} package definition"
            )
            summaries.append(
                (
                    "dependencies",
                    subject,
                    [
                        f"{label} dependency hashes: {join_names(hashes)}"
                        if hashes
                        else f"{label}: refresh package definition"
                    ],
                )
            )
        else:
            summaries.append(("other", f"update {path}", [f"Update {path}"]))
    summaries.sort(
        key=lambda summary: {
            "package": 0,
            "configuration": 1,
            "dependencies": 2,
            "other": 3,
        }[summary[0]]
    )
    if clients:
        subject = "update " + join_names(sorted(clients))
    elif len(summaries) == 1:
        subject = summaries[0][1]
    else:
        categories = {summary[0] for summary in summaries}
        subject = "refresh " + join_names(
            label
            for category, label in (
                ("configuration", "plugin configuration"),
                ("dependencies", "dependencies"),
                ("other", "generated files"),
            )
            if category in categories
        )
    if len(f"plugins: {subject}") > 72:
        subject = "refresh " + ("client packages" if clients else "workflow outputs")
    lines = [line for _, _, details in summaries for line in details]
    if len(summaries) == 1 and (subject.startswith(("remove ", "add "))):
        lines = []
    return message("plugins", subject, lines)


def channel_label(channel):
    platform, _, release = channel.partition("-")
    return f"{ {'linux': 'Linux', 'osx': 'macOS'}.get(platform, platform) } {release.upper() if release == 'ptb' else release.capitalize()}"


def discord_message(paths):
    lines, versions, channels = [], [], []
    for path in paths:
        old = json.loads(before(path) or "{}")
        new = json.loads(Path(path).read_text()) if Path(path).is_file() else {}
        for channel in sorted(old.keys() | new.keys()):
            left, right = old.get(channel), new.get(channel)
            if left == right:
                continue
            channels.append(channel)
            label = channel_label(channel)
            if left is None or right is None:
                lines.append(
                    f"{label}: {'add' if right is not None else 'remove'} source"
                )
                continue
            details = []
            if left.get("version") != right.get("version"):
                versions.append((label, right.get("version")))
                details.append(f"{left.get('version')} -> {right.get('version')}")
            elif left.get("distro") != right.get("distro"):
                details.append("refresh distro source")
            old_modules, new_modules = left.get("modules", {}), right.get("modules", {})
            for verb, names in zip(
                ("add", "remove", "refresh"),
                delta(old_modules, new_modules),
                strict=True,
            ):
                if names:
                    detail = f"{verb} {len(names)} module source{'s' if len(names) != 1 else ''}"
                    if len(names) <= 3:
                        detail += f" ({join_names(names)})"
                    details.append(detail)
            lines.append(f"{label}: {'; '.join(details) or 'refresh source metadata'}")
        if old == new:
            lines.append("Reformat Discord source metadata")
    if len(versions) == 1:
        subject = f"update {versions[0][0]} to {versions[0][1]}"
    elif len(channels) == 1:
        subject = f"refresh {channel_label(channels[0])} sources"
    elif channels:
        releases = sorted({channel.partition("-")[2] for channel in channels})
        subject = (
            ("update " if versions else "refresh ")
            + join_names(
                release.upper() if release == "ptb" else release.capitalize()
                for release in releases
            )
            + " sources"
        )
    else:
        subject = "reformat source metadata"
    if len(f"discord: {subject}") > 72:
        subject = "refresh channel sources"
    return message("discord", subject, lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("plugins", "discord"))
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    # Resolve pathspecs through Git so directory inputs describe only changed
    # files, including additions and deletions, rather than the directory itself
    paths = set()
    for command in (
        ["git", "diff", "--name-only", "--no-renames", "-z", "HEAD", "--"],
        ["git", "ls-files", "--others", "--exclude-standard", "-z", "--"],
    ):
        paths.update(
            path
            for path in subprocess.check_output(command + args.paths, text=True).split(
                "\0"
            )
            if path
        )
    if not paths:
        print(json.dumps({"headline": f"{args.kind}: no changes", "body": ""}))
        return
    result = (
        plugin_message(sorted(paths))
        if args.kind == "plugins"
        else discord_message(sorted(paths))
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
