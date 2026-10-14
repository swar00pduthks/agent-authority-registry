"""Skill wheels: a wheel is a zip holding SKILL.md and skill.json in a package folder."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile

import yaml


def _record(data: bytes) -> str:
    return "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()


def build_wheel(skill_md: str, manifest: dict) -> bytes:
    dist = "ubs_skill_" + manifest["id"].replace("-", "_")
    info = f"{dist}-{manifest['version']}.dist-info"
    manifest_bytes = json.dumps(manifest, indent=2).encode()
    files = {
        f"{dist}/SKILL.md": skill_md.encode(),
        f"{dist}/skill.json": manifest_bytes,
        f"{info}/METADATA": f"Metadata-Version: 2.1\nName: {dist.replace('_', '-')}\nVersion: {manifest['version']}\n".encode(),
        f"{info}/WHEEL": b"Wheel-Version: 1.0\nGenerator: registry\nRoot-Is-Purelib: true\nTag: py3-none-any\n",
    }
    files[f"{info}/RECORD"] = (
        "".join(f"{n},{_record(d)},{len(d)}\n" for n, d in files.items()) + f"{info}/RECORD,,\n"
    ).encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, d in files.items():
            z.writestr(n, d)
    return buf.getvalue()


def read_wheel(data: bytes) -> tuple[str, dict]:
    """Return (SKILL.md text, skill.json) from a wheel, validating the pair."""
    if len(data) > 1_000_000:
        raise ValueError("wheel is larger than 1 MB")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        infos = z.infolist()
        if len(infos) > 20 or sum(i.file_size for i in infos) > 1_000_000 or any(i.file_size > 262_144 for i in infos):
            raise ValueError("wheel has too many or too large files")
        names = [n for n in z.namelist() if n.count("/") == 1 and not n.split("/")[0].endswith(".dist-info")]
        by_leaf = {n.split("/")[1]: n for n in names}
        if "SKILL.md" not in by_leaf or "skill.json" not in by_leaf:
            raise ValueError("wheel must contain SKILL.md and skill.json in its package folder")
        skill_md = z.read(by_leaf["SKILL.md"]).decode()
        manifest = json.loads(z.read(by_leaf["skill.json"]))
    fm = yaml.safe_load(skill_md.split("---")[1])
    for k in ("id", "version", "label", "blurb", "accent"):
        if not manifest.get(k):
            raise ValueError(f"skill.json is missing {k!r}")
    if fm.get("name") != manifest["id"]:
        raise ValueError(f"SKILL.md name {fm.get('name')!r} must equal skill.json id {manifest['id']!r}")
    manifest["description"] = str(fm["description"])
    return skill_md, manifest


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
