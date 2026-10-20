"""Verify packaged offline resources against the local, validated web build."""

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(apk, dist):
    prefix = "assets/public/"
    with ZipFile(apk) as archive:
        packaged = set(archive.namelist())
        files = [item for item in dist.rglob("*") if item.is_file()]
        expected = {prefix + item.relative_to(dist).as_posix() for item in files}
        actual = {name for name in packaged if name.startswith(prefix) and not name.endswith("/")}
        # Capacitor adds these empty compatibility stubs when no Cordova plugins
        # are installed. Permit exactly those generated files, and verify bytes.
        stubs = {prefix + "cordova.js", prefix + "cordova_plugins.js"}
        for name in actual & stubs:
            assert archive.read(name) == b"", name
        assert actual - stubs == expected, {
            "missing": sorted(expected - actual),
            "unexpected": sorted(actual - expected - stubs),
        }
        for item in files:
            name = prefix + item.relative_to(dist).as_posix()
            assert digest(archive.read(name)) == digest(item.read_bytes()), name

        manifest = json.loads(archive.read(prefix + "practice/manifest.json"))
        for asset in manifest["assets"]:
            data = archive.read(prefix + "practice/" + asset["path"])
            assert len(data) == asset["bytes"], asset["path"]
            assert digest(data) == asset["sha256"], asset["path"]
        return {
            "apk": str(apk.resolve()),
            "bytes": apk.stat().st_size,
            "sha256": digest(apk.read_bytes()),
            "verified_web_files": len(files),
            "verified_practice_assets": len(manifest["assets"]),
            "practice_revision": manifest["revision"],
            "questions": {
                kind: len(group["questions"])
                for kind, group in manifest["catalog"].items()
            },
            "vocabulary_seed_sha256": digest(archive.read(prefix + "vocabulary-seed.json")),
        }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--dist", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    args = parser.parse_args()
    print(json.dumps(verify(args.apk, args.dist), ensure_ascii=False, indent=2))
