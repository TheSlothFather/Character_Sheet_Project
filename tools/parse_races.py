"""
Parser for Race and Skills.doc content converted to text via pandoc.

The script normalizes lineages (races), cultures (subraces), features, and
atomic effects into JSON files aligned with the schema proposed in
``docs/ttrpg_data_schema.md``. It expects the DOC to be converted to plain text
by ``pandoc`` and will emit a validation report for unparsed or ambiguous lines.
"""
import argparse
import json
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return cleaned.upper()


@dataclass
class ParserConfig:
    pandoc_binary: str = "pandoc"
    attribute_aliases: Dict[str, str] = field(
        default_factory=lambda: {
            "physical": "PHYSICAL",
            "mental": "MENTAL",
            "will": "WILL",
            "spiritual": "SPIRITUAL",
        }
    )
    skill_aliases: Dict[str, str] = field(
        default_factory=lambda: {
            "battle": "BATTLE",
            "navigate": "NAVIGATE",
            "worship": "WORSHIP",
            "psionic technique": "PSIONIC_TECHNIQUE",
            "resist psionics": "RESIST_PSIONICS",
            "resist supernatural": "RESIST_SUPERNATURAL",
            "counter will dakar": "COUNTER_WILL_DAKAR",
        }
    )
    language_aliases: Dict[str, str] = field(default_factory=dict)
    size_aliases: Dict[str, str] = field(
        default_factory=lambda: {
            "tiny": "TINY",
            "small": "SMALL",
            "medium": "MEDIUM",
            "large": "LARGE",
            "huge": "HUGE",
        }
    )
    default_category: str = "trait"

    @classmethod
    def from_path(cls, mapping_path: Optional[Path]) -> "ParserConfig":
        if not mapping_path:
            return cls()
        with mapping_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return cls(
            pandoc_binary=payload.get("pandoc_binary", "pandoc"),
            attribute_aliases=payload.get("attributes", {}),
            skill_aliases=payload.get("skills", {}),
            language_aliases=payload.get("languages", {}),
            size_aliases=payload.get("sizes", {}),
            default_category=payload.get("default_category", "trait"),
        )


@dataclass
class ValidationReport:
    unparsed_lines: List[str] = field(default_factory=list)
    unparsed_effects: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def add_unparsed_line(self, line: str) -> None:
        self.unparsed_lines.append(line)

    def add_unparsed_effect(self, text: str) -> None:
        self.unparsed_effects.append(text)

    def summarize(self) -> str:
        return json.dumps(
            {
                "unparsed_lines": self.unparsed_lines,
                "unparsed_effects": self.unparsed_effects,
                "warnings": self.warnings,
            },
            indent=2,
        )

    def has_errors(self) -> bool:
        return bool(self.unparsed_lines or self.unparsed_effects)


@dataclass
class EntityStore:
    attributes: Dict[str, Dict[str, str]] = field(default_factory=dict)
    skills: Dict[str, Dict[str, str]] = field(default_factory=dict)
    languages: Dict[str, Dict[str, str]] = field(default_factory=dict)
    lineages: Dict[str, Dict[str, str]] = field(default_factory=dict)
    cultures: Dict[str, Dict[str, str]] = field(default_factory=dict)
    features: Dict[str, Dict[str, str]] = field(default_factory=dict)
    effects: List[Dict[str, object]] = field(default_factory=list)

    def ensure_attribute(self, name: str, description: str = "") -> str:
        code = slugify(name)
        if code not in self.attributes:
            self.attributes[code] = {
                "id": str(uuid.uuid4()),
                "code": code,
                "name": name.strip(),
                "description": description,
            }
        return self.attributes[code]["id"]

    def ensure_skill(self, name: str, description: str = "") -> str:
        code = slugify(name)
        if code not in self.skills:
            self.skills[code] = {
                "id": str(uuid.uuid4()),
                "code": code,
                "name": name.strip(),
                "description": description,
            }
        return self.skills[code]["id"]

    def ensure_language(self, name: str) -> str:
        code = slugify(name)
        if code not in self.languages:
            self.languages[code] = {
                "id": str(uuid.uuid4()),
                "code": code,
                "name": name.strip(),
            }
        return self.languages[code]["id"]

    def ensure_lineage(self, name: str) -> str:
        code = slugify(name)
        if code not in self.lineages:
            self.lineages[code] = {
                "id": str(uuid.uuid4()),
                "code": code,
                "name": name.strip(),
                "size_code": None,
                "movement": {},
                "languages": [],
                "description": "",
            }
        return self.lineages[code]["id"]

    def ensure_culture(self, name: str, lineage_id: str) -> str:
        code = slugify(name)
        if code not in self.cultures:
            self.cultures[code] = {
                "id": str(uuid.uuid4()),
                "code": code,
                "lineage_id": lineage_id,
                "name": name.strip(),
                "languages": [],
                "description": "",
            }
        return self.cultures[code]["id"]

    def add_feature(self, *, source_type: str, source_id: str, name: str, category: str, description: str = "") -> str:
        code = slugify(name)
        key = f"{source_id}:{code}"
        if key not in self.features:
            self.features[key] = {
                "id": str(uuid.uuid4()),
                "code": code,
                "source_type": source_type,
                "source_id": source_id,
                "name": name.strip(),
                "category": category,
                "description": description,
            }
        return self.features[key]["id"]

    def add_effect(
        self,
        *,
        feature_id: str,
        effect_type: str,
        target: Dict[str, str],
        magnitude: Dict[str, object],
        applies_automatically: bool = True,
        conditions: Optional[List[Dict[str, object]]] = None,
    ) -> None:
        self.effects.append(
            {
                "id": str(uuid.uuid4()),
                "feature_id": feature_id,
                "effect_type": effect_type,
                "target": target,
                "magnitude": magnitude,
                "applies_automatically": applies_automatically,
                "conditions": conditions or [],
            }
        )


class RaceParser:
    def __init__(self, config: ParserConfig) -> None:
        self.config = config
        self.report = ValidationReport()
        self.store = EntityStore()

        for attr_name in self.config.attribute_aliases.values():
            self.store.ensure_attribute(attr_name)

    def parse(self, text: str) -> Tuple[EntityStore, ValidationReport]:
        current_lineage: Optional[Tuple[str, str]] = None  # (id, name)
        current_culture: Optional[Tuple[str, str]] = None
        tokens = [line.strip() for line in text.splitlines() if line.strip()]

        for line in tokens:
            heading_match = re.fullmatch(r"[A-Z][A-Za-z'\- ]+", line)
            if heading_match:
                lineage_id = self.store.ensure_lineage(line)
                current_lineage = (lineage_id, line)
                current_culture = None
                continue

            if line.lower().startswith("subrace of") or line.lower().startswith("culture of"):
                if not current_lineage:
                    self.report.add_unparsed_line(line)
                    continue
                name = line.split(":", 1)[-1].strip() if ":" in line else line.split("of", 1)[-1].strip()
                culture_id = self.store.ensure_culture(name, current_lineage[0])
                current_culture = (culture_id, name)
                continue

            if self._parse_size_movement_line(line, current_lineage, current_culture):
                continue
            if self._parse_language_line(line, current_lineage, current_culture):
                continue
            if self._parse_attribute_or_skill_line(line, current_lineage, current_culture):
                continue
            if self._parse_feature_line(line, current_lineage, current_culture):
                continue

            self.report.add_unparsed_line(line)

        return self.store, self.report

    def _parse_size_movement_line(
        self,
        line: str,
        current_lineage: Optional[Tuple[str, str]],
        current_culture: Optional[Tuple[str, str]],
    ) -> bool:
        size_match = re.search(r"size[: ]+([A-Za-z]+)", line, flags=re.IGNORECASE)
        move_match = re.search(r"movement[: ]+(\d+)", line, flags=re.IGNORECASE)
        if size_match or move_match:
            container = self._current_container(current_lineage, current_culture)
            if not container:
                return False
            entity = self._lookup_entity(container)
            if size_match:
                raw_size = size_match.group(1).lower()
                entity["size_code"] = self.config.size_aliases.get(raw_size, slugify(raw_size))
            if move_match:
                entity.setdefault("movement", {})["walk"] = int(move_match.group(1))
            return True
        return False

    def _parse_language_line(
        self,
        line: str,
        current_lineage: Optional[Tuple[str, str]],
        current_culture: Optional[Tuple[str, str]],
    ) -> bool:
        if not line.lower().startswith("languages"):
            return False
        container = self._current_container(current_lineage, current_culture)
        if not container:
            return False
        languages_part = line.split(":", 1)[-1]
        names = [chunk.strip() for chunk in re.split(r",|/", languages_part) if chunk.strip()]
        for name in names:
            language_id = self.store.ensure_language(self.config.language_aliases.get(name.lower(), name))
            target = self._lookup_entity(container)
            target.setdefault("languages", []).append(
                {"language_id": language_id, "proficiency": "native"}
            )
        return True

    def _parse_attribute_or_skill_line(
        self,
        line: str,
        current_lineage: Optional[Tuple[str, str]],
        current_culture: Optional[Tuple[str, str]],
    ) -> bool:
        if line.lower().startswith("feature"):
            return False
        if not re.search(r"[+-]\d", line):
            return False
        container = self._current_container(current_lineage, current_culture)
        if not container:
            return False
        feature_name = f"{container[1]} Baseline"
        feature_id = self.store.add_feature(
            source_type=container[0],
            source_id=self._lookup_entity(container)["id"],
            name=feature_name,
            category=self.config.default_category,
        )
        fragments = re.split(r"[,;]", line)
        handled = False
        for fragment in fragments:
            frag = fragment.strip()
            numeric = re.search(r"([+-])(\d+)%?\s+(.+)", frag)
            if not numeric:
                continue
            sign, value, tail = numeric.group(1), numeric.group(2), numeric.group(3)
            magnitude_value = int(value) if sign == "+" else -int(value)
            effect_type, target = self._classify_target(tail)
            if not effect_type:
                self.report.add_unparsed_effect(frag)
                continue
            magnitude: Dict[str, object] = {"flat": magnitude_value}
            if "%" in frag:
                magnitude = {"percent": magnitude_value}
                if effect_type == "skill_bonus":
                    effect_type = "damage_modifier"
            self.store.add_effect(
                feature_id=feature_id,
                effect_type=effect_type,
                target=target,
                magnitude=magnitude,
            )
            handled = True
        return handled

    def _parse_feature_line(
        self,
        line: str,
        current_lineage: Optional[Tuple[str, str]],
        current_culture: Optional[Tuple[str, str]],
    ) -> bool:
        if not line.lower().startswith("feature"):
            return False
        container = self._current_container(current_lineage, current_culture)
        if not container:
            self.report.add_unparsed_line(line)
            return False
        if "-" in line:
            header, effect_text = line.split("-", 1)
        else:
            header, effect_text = line, ""
        name_part = header.split(":", 1)
        feature_name = name_part[-1].strip() if len(name_part) > 1 else header.replace("Feature", "").strip()
        feature_id = self.store.add_feature(
            source_type=container[0],
            source_id=self._lookup_entity(container)["id"],
            name=feature_name,
            category=self.config.default_category,
            description=effect_text.strip(),
        )
        if effect_text.strip():
            self._parse_effect_fragments(effect_text.strip(), feature_id)
        return True

    def _parse_effect_fragments(self, text: str, feature_id: str) -> None:
        fragments = [frag.strip() for frag in re.split(r"[.;]", text) if frag.strip()]
        for frag in fragments:
            effect_type, target = self._classify_target(frag)
            magnitude = self._extract_magnitude(frag)
            conditions = self._extract_conditions(frag)
            if not effect_type or not magnitude:
                self.report.add_unparsed_effect(frag)
                continue
            self.store.add_effect(
                feature_id=feature_id,
                effect_type=effect_type,
                target=target,
                magnitude=magnitude,
                applies_automatically="choice" not in frag.lower(),
                conditions=conditions,
            )

    def _extract_conditions(self, text: str) -> List[Dict[str, object]]:
        conditions: List[Dict[str, object]] = []
        lowered = text.lower()
        if "swamp" in lowered or "swampland" in lowered:
            conditions.append({"condition_type": "environment", "condition_value": {"equals": "swampland"}})
        if "dark" in lowered:
            conditions.append({"condition_type": "lighting", "condition_value": {"equals": "darkness"}})
        if "indoor" in lowered or "indoors" in lowered:
            conditions.append({"condition_type": "environment", "condition_value": {"equals": "indoor"}})
        if "against" in lowered:
            opponent = lowered.split("against", 1)[-1].strip()
            conditions.append({"condition_type": "opponent", "condition_value": opponent})
        if "once per" in lowered:
            conditions.append({"condition_type": "usage_frequency", "condition_value": "once"})
        return conditions

    def _extract_magnitude(self, text: str) -> Optional[Dict[str, object]]:
        percent = re.search(r"([+-]?\d+)%", text)
        if percent:
            return {"percent": int(percent.group(1))}
        flat = re.search(r"([+-]?\d+)", text)
        if flat:
            return {"flat": int(flat.group(1))}
        if "advantage" in text.lower():
            return {"rule": "advantage"}
        if "disadvantage" in text.lower():
            return {"rule": "disadvantage"}
        if "free action" in text.lower():
            return {"rule": "free_action"}
        return None

    def _classify_target(self, text: str) -> Tuple[Optional[str], Dict[str, str]]:
        lowered = text.lower()
        for alias, code in self.config.skill_aliases.items():
            if alias in lowered:
                skill_id = self.store.ensure_skill(code)
                return "skill_bonus", {"type": "skill", "code": code, "id": skill_id}
        for alias, code in self.config.attribute_aliases.items():
            if alias in lowered:
                attr_id = self.store.ensure_attribute(code)
                return "attribute_bonus", {"type": "attribute", "code": code, "id": attr_id}
        if "movement" in lowered or "speed" in lowered:
            return "movement_mod", {"type": "movement", "mode": "walk"}
        if "language" in lowered:
            return "language_grant", {"type": "language"}
        if "resistance" in lowered:
            return "resistance", {"type": "damage"}
        if "advantage" in lowered or "disadvantage" in lowered:
            return "advantage_rule", {"type": "rule"}
        if "free action" in lowered:
            return "action_cost_mod", {"type": "action"}
        if "initiative" in lowered:
            return "derived_stat_bonus", {"type": "derived_stat", "code": "INITIATIVE"}
        return None, {}

    def _current_container(self, current_lineage: Optional[Tuple[str, str]], current_culture: Optional[Tuple[str, str]]) -> Optional[Tuple[str, str]]:
        if current_culture:
            return ("culture", current_culture[1])
        if current_lineage:
            return ("lineage", current_lineage[1])
        return None

    def _lookup_entity(self, container: Tuple[str, str]) -> Dict[str, str]:
        kind, name = container
        code = slugify(name)
        if kind == "lineage":
            return self.store.lineages[code]
        if kind == "culture":
            return self.store.cultures[code]
        raise ValueError(f"Unknown container kind {kind}")


def convert_input_to_text(input_path: Path, pandoc_binary: str) -> str:
    if input_path.suffix.lower() == ".txt":
        return input_path.read_text(encoding="utf-8")
    try:
        result = subprocess.run(
            [pandoc_binary, str(input_path), "-t", "plain"],
            check=True,
            capture_output=True,
        )
    except FileNotFoundError as exc:  # pragma: no cover - exercised in runtime, not tests
        raise SystemExit(
            "pandoc is required to convert the DOC to text. Install pandoc or supply a .txt conversion."
        ) from exc
    except subprocess.CalledProcessError as exc:  # pragma: no cover - execution path only when pandoc fails
        raise SystemExit(f"pandoc failed: {exc.stderr.decode('utf-8', errors='ignore')}") from exc
    return result.stdout.decode("utf-8", errors="ignore")


def write_json(output_dir: Path, name: str, payload: Iterable[object]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / name
    with path.open("w", encoding="utf-8") as handle:
        json.dump(list(payload), handle, indent=2)


def emit_outputs(store: EntityStore, output_dir: Path) -> None:
    write_json(output_dir, "attributes.json", store.attributes.values())
    write_json(output_dir, "skills.json", store.skills.values())
    write_json(output_dir, "languages.json", store.languages.values())
    write_json(output_dir, "lineages.json", store.lineages.values())
    write_json(output_dir, "cultures.json", store.cultures.values())
    write_json(output_dir, "features.json", store.features.values())
    write_json(output_dir, "effects.json", store.effects)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parse Race and Skills DOC into normalized JSON artifacts.")
    parser.add_argument("--input", dest="input_path", required=True, help="Path to Race and Skills.doc or a preconverted .txt file.")
    parser.add_argument("--output", dest="output_dir", required=True, help="Directory to write JSON files.")
    parser.add_argument("--validate-only", action="store_true", help="Run parsing and validation without writing output files.")
    parser.add_argument("--mapping", dest="mapping", help="Optional JSON mapping file for aliases and pandoc path.")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> None:
    args = parse_args(argv)
    config = ParserConfig.from_path(Path(args.mapping)) if args.mapping else ParserConfig()
    input_path = Path(args.input_path)
    output_dir = Path(args.output_dir)
    text = convert_input_to_text(input_path, config.pandoc_binary)
    parser = RaceParser(config)
    store, report = parser.parse(text)

    print("Validation report:")
    print(report.summarize())
    if report.has_errors():
        sys.stderr.write("Unparsed content remains; fix mappings or parser rules.\n")
        sys.exit(1)

    if args.validate_only:
        return

    emit_outputs(store, output_dir)
    print(f"Wrote JSON outputs to {output_dir}")


if __name__ == "__main__":
    main()
