from pathlib import Path

path = Path(".env.smoke.local")
out = []
for line in path.read_text(encoding="utf-8").splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or "=" not in line:
        out.append(line)
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        out.append(f"{key}={value}")
        continue
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    out.append(f'{key}="{escaped}"')
path.write_text("\n".join(out) + "\n", encoding="utf-8")
print("quoted", path)
for line in out:
    if "=" in line:
        key, value = line.split("=", 1)
        bare = value[1:-1] if value.startswith('"') and value.endswith('"') else value
        print(key, "quoted" if value.startswith('"') else "raw", "len", len(bare))
