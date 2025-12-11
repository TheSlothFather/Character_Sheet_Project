import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "Backgrounds.txt"
output = ROOT / "client" / "src" / "data" / "backgrounds.csv"

stage_headers = {
    "1. family": "Family",
    "family": "Family",
    "2. childhood": "Childhood",
    "childhood": "Childhood",
    "3. adolescence": "Adolescence",
    "adolescence": "Adolescence",
    "4. adulthood": "Adulthood",
    "adulthood": "Adulthood",
    "flaws:": "Flaws",
    "flaws": "Flaws",
    "5. inciting incident": "Inciting Incident",
    "inciting incident": "Inciting Incident",
}

stop_markers = {"starting wealth"}

lines = source.read_text(encoding="utf-8", errors="ignore").splitlines()

entries = []
current_stage = None
current_entry = None


def flush_entry():
    global current_entry
    if current_entry:
        current_entry["details"] = current_entry["details"].strip()
        entries.append(current_entry)
    current_entry = None


for raw_line in lines:
    line = raw_line.strip()
    lower = line.lower()
    if not line:
        continue

    if lower in stop_markers:
        flush_entry()
        break

    if lower in stage_headers:
        flush_entry()
        current_stage = stage_headers[lower]
        continue

    if current_stage and line.startswith("*"):
        flush_entry()
        content = line.lstrip("* ")
        if ":" in content:
            name, desc = content.split(":", 1)
        else:
            name, desc = content, ""
        current_entry = {
            "stage": current_stage,
            "name": name.strip(),
            "details": desc.strip(),
        }
        continue

    if current_entry:
        # combine wrapped lines into details
        if current_entry["details"]:
            current_entry["details"] += " " + line
        else:
            current_entry["details"] = line

flush_entry()

output.parent.mkdir(parents=True, exist_ok=True)
with output.open("w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["stage", "name", "details"])
    writer.writeheader()
    writer.writerows(entries)

print(f"Wrote {len(entries)} entries to {output}")
