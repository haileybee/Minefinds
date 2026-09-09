#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess
import textwrap

HISTORICAL = "f74d3fe41c6df8ad5028ccf5de84c586e49f7f88:.github/workflows/build-apk.yml"
text = subprocess.check_output(["git", "show", HISTORICAL], text=True)
lines = text.splitlines()
blocks = []
i = 0
while i < len(lines):
    line = lines[i]
    if line.strip() == "run: |":
        indent = len(line) - len(line.lstrip())
        i += 1
        body = []
        while i < len(lines):
            current = lines[i]
            if current.strip() and len(current) - len(current.lstrip()) <= indent:
                break
            body.append(current[indent + 2:] if len(current) >= indent + 2 else "")
            i += 1
        blocks.append("\n".join(body))
        continue
    i += 1

selected = [b for b in blocks if "signing/minefinds.keystore" in b or "signingConfigs" in b]
if len(selected) < 2:
    raise SystemExit("Historical MineFinds signing setup could not be located")

for block in selected:
    subprocess.run(["bash", "-e", "-c", textwrap.dedent(block)], check=True)

build = Path("app/build.gradle")
content = build.read_text()
content = re.sub(r"versionCode\s+\d+", "versionCode 3", content, count=1)
content = re.sub(r"versionName\s+['\"][^'\"]+['\"]", "versionName '1.1.0'", content, count=1)
build.write_text(content)

if "versionCode 3" not in content or "versionName '1.1.0'" not in content:
    raise SystemExit("v1.1.0 version configuration was not applied")
