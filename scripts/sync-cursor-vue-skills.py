#!/usr/bin/env python3
"""Sync vuejs-ai/skills into .cursor/skills (jsDelivr mirror when git clone fails)."""
from __future__ import annotations

import json
import pathlib
import urllib.request

SKILLS = (
    "vue-best-practices",
    "vue-pinia-best-practices",
    "create-adaptable-composable",
)
BASE = "https://cdn.jsdelivr.net/gh/vuejs-ai/skills@main"
ROOT = pathlib.Path(__file__).resolve().parents[1] / ".cursor" / "skills"


def main() -> None:
    req = urllib.request.Request(
        "https://api.github.com/repos/vuejs-ai/skills/git/trees/main?recursive=1",
        headers={"User-Agent": "five-line-staff-sync"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        tree = json.load(resp)

    paths = [e["path"] for e in tree.get("tree", []) if e["type"] == "blob"]
    for skill in SKILLS:
        prefix = f"skills/{skill}/"
        files = [p for p in paths if p.startswith(prefix)]
        print(f"{skill}: {len(files)} files")
        for repo_path in files:
            rel = repo_path.removeprefix("skills/")
            dest = ROOT / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(f"{BASE}/{repo_path}", dest)
    print(f"Synced to {ROOT}")


if __name__ == "__main__":
    main()
