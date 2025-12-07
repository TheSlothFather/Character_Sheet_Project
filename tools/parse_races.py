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
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")
    return cleaned.upper()


def human_id(prefix: str, code: str, *, suffix: str | None = None) -> str:
    base = f"{prefix}_{slugify(code)}"
    return f"{base}_{slugify(suffix)}" if suffix else base


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
            **{
                name.lower(): slugify(name)
                for name in [
                    "Battle",
                    "Feat of Strength",
                    "Feat of Agility",
                    "Conceal",
                    "Resist Toxins",
                    "Psionic Technique",
                    "Academic Recall",
                    "Translate",
                    "Search",
                    "Resist Psionics",
                    "Worship",
                    "Sense Supernatural",
                    "Resist Supernatural",
                    "Attune Wonderous Item",
                    "Divine Intervention",
                    "Will Dakar",
                    "Endure",
                    "Persevere",
                    "Feat of Austerity",
                    "Feat of Defiance",
                    "Track",
                    "Craft",
                    "Forage",
                    "Navigate",
                    "Heal",
                    "Animal Husbandry",
                    "Intimidate",
                    "Seduce",
                    "Perform",
                    "Trade",
                    "Gather Intelligence",
                    "Deceive",
                    "Interpret",
                    "Deduce",
                    "Identify",
                    "Parley",
                    "Artistry",
                    "Incite Fate",
                    "Martial Prowess",
                    "Ildakar Faculty",
                ]
            },
            "counter will dakar": "WILL_DAKAR",
            "deception": "DECEIVE",
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
    known_lineages: List[str] = field(
        default_factory=lambda: ["Inin", "Anz", "Phi'ilin", "Cerevu", "Venii", "Freinin"]
    )
    culture_lineage_map: Dict[str, str] = field(
        default_factory=lambda: {
            "bryonin": "Inin",
            "ecthvasin": "Inin",
            "ganzenonin": "Inin",
            "georothin": "Inin",
            "grazin": "Inin",
            "jiinin": "Inin",
            "kaindorin": "Inin",
            "letelin": "Inin",
            "melfarionin": "Inin",
            "rivanonin": "Inin",
            "rodonin": "Inin",
            "thairin": "Inin",
            "thuilin": "Inin",
            "east anzar": "Anz",
            "west anzar": "Anz",
            "elari": "Phi'ilin",
            "laigoni": "Phi'ilin",
            "rodini": "Phi'ilin",
            "darii": "Cerevu",
            "cerii": "Cerevu",
            "agunic": "Venii",
            "unfaic": "Venii",
            "freinin": "Freinin",
        }
    )

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
    effect_counters: Dict[str, int] = field(default_factory=dict)
    lineage_codes: Dict[str, str] = field(default_factory=dict)
    culture_codes: Dict[str, str] = field(default_factory=dict)

    def ensure_attribute(self, name: str, description: str = "") -> str:
        code = slugify(name)
        if code not in self.attributes:
            attr_id = human_id("ATTR", code)
            self.attributes[code] = {
                "id": attr_id,
                "code": code,
                "name": name.strip(),
                "description": description,
            }
        return self.attributes[code]["id"]

    def ensure_skill(self, name: str, description: str = "") -> str:
        code = slugify(name)
        if code not in self.skills:
            skill_id = human_id("SKILL", code)
            self.skills[code] = {
                "id": skill_id,
                "code": code,
                "name": name.strip(),
                "description": description,
            }
        return self.skills[code]["id"]

    def ensure_language(self, name: str) -> str:
        code = slugify(name)
        if code not in self.languages:
            lang_id = human_id("LANG", code)
            self.languages[code] = {
                "id": lang_id,
                "code": code,
                "name": name.strip(),
            }
        return self.languages[code]["id"]

    def ensure_lineage(self, name: str) -> str:
        code = slugify(name)
        if code not in self.lineages:
            lineage_id = human_id("LIN", code)
            self.lineages[code] = {
                "id": lineage_id,
                "code": code,
                "name": name.strip(),
                "size_code": None,
                "movement": {},
                "languages": [],
                "description": "",
            }
            self.lineage_codes[lineage_id] = code
        return self.lineages[code]["id"]

    def ensure_culture(self, name: str, lineage_id: str) -> str:
        code = slugify(name)
        if code not in self.cultures:
            lineage_code = self.lineage_codes.get(lineage_id, slugify(lineage_id))
            culture_id = human_id("CUL", f"{lineage_code}_{code}")
            self.cultures[code] = {
                "id": culture_id,
                "code": code,
                "lineage_id": lineage_id,
                "name": name.strip(),
                "languages": [],
                "description": "",
            }
            self.culture_codes[culture_id] = code
        return self.cultures[code]["id"]

    def add_feature(self, *, source_type: str, source_id: str, name: str, category: str, description: str = "") -> str:
        code = slugify(name)
        key = f"{source_id}:{code}"
        if key not in self.features:
            source_code = self._source_code(source_type, source_id)
            feature_id = human_id("FEAT", f"{source_code}_{code}")
            self.features[key] = {
                "id": feature_id,
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
        effect_id = self._next_effect_id(feature_id)
        self.effects.append(
            {
                "id": effect_id,
                "feature_id": feature_id,
                "effect_type": effect_type,
                "target": target,
                "magnitude": magnitude,
                "applies_automatically": applies_automatically,
                "conditions": conditions or [],
            }
        )

    def _source_code(self, source_type: str, source_id: str) -> str:
        if source_type == "lineage":
            return self.lineage_codes.get(source_id, slugify(source_id))
        if source_type == "culture":
            return self.culture_codes.get(source_id, slugify(source_id))
        return slugify(source_id)

    def _next_effect_id(self, feature_id: str) -> str:
        self.effect_counters[feature_id] = self.effect_counters.get(feature_id, 0) + 1
        return f"{feature_id}_E{self.effect_counters[feature_id]:02d}"


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
        current_feature: Optional[str] = None
        known_lineages = {name.lower(): name for name in self.config.known_lineages}
        tokens = [line.strip() for line in text.splitlines() if line.strip()]

        for line in tokens:
            heading_match = re.fullmatch(r"[A-Z][A-Za-z'\- ]+", line)
            if heading_match and len(line.split()) <= 4:
                heading = heading_match.group(0)
                mapped_lineage = self.config.culture_lineage_map.get(heading.lower())
                if mapped_lineage:
                    lineage_id = self.store.ensure_lineage(mapped_lineage)
                    current_lineage = (lineage_id, mapped_lineage)
                    culture_id = self.store.ensure_culture(heading, lineage_id)
                    current_culture = (culture_id, heading)
                    current_feature = None
                    continue
                if heading.lower() not in known_lineages:
                    current_lineage = None
                    current_culture = None
                    current_feature = None
                    continue
                lineage_id = self.store.ensure_lineage(heading)
                current_lineage = (lineage_id, heading)
                current_culture = None
                current_feature = None
                continue

            if not current_lineage and not current_culture:
                continue

            if line.lower().startswith("subrace of") or line.lower().startswith("culture of"):
                if not current_lineage:
                    self.report.add_unparsed_line(line)
                    continue
                name = line.split(":", 1)[-1].strip() if ":" in line else line.split("of", 1)[-1].strip()
                culture_id = self.store.ensure_culture(name, current_lineage[0])
                current_culture = (culture_id, name)
                current_feature = None
                continue

            if self._parse_size_movement_line(line, current_lineage, current_culture):
                continue
            if self._parse_language_line(line, current_lineage, current_culture):
                continue
            feature_id = None
            if current_feature:
                feature_id = current_feature
            if self._parse_attribute_or_skill_line(line, current_lineage, current_culture, feature_id):
                continue
            parsed_feature_id = self._parse_feature_line(line, current_lineage, current_culture)
            if parsed_feature_id:
                current_feature = parsed_feature_id
                continue

            if self._append_description(line, current_lineage, current_culture, current_feature):
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
        current_feature_id: Optional[str],
    ) -> bool:
        if line.lower().startswith("feature"):
            return False
        if not re.search(r"[+-]\d", line):
            return False
        container = self._current_container(current_lineage, current_culture)
        if not container:
            return False
        feature_id = current_feature_id
        if not feature_id:
            feature_name = f"{container[1]} Baseline"
            feature_id = self.store.add_feature(
                source_type=container[0],
                source_id=self._lookup_entity(container)["id"],
                name=feature_name,
                category=self.config.default_category,
            )
        fragments = self._split_fragments(line)
        handled = False
        for frag in fragments:
            effect_type, target = self._classify_target(frag)
            magnitude = self._extract_magnitude(frag, effect_type)
            conditions = self._extract_conditions(frag)
            if not effect_type or not magnitude:
                self.report.warnings.append(f"Skipped numeric fragment: {frag}")
                continue
            if "%" in frag and effect_type == "skill_bonus":
                effect_type = "damage_modifier"
            self.store.add_effect(
                feature_id=feature_id,
                effect_type=effect_type,
                target=target,
                magnitude=magnitude,
                conditions=conditions,
            )
            handled = True
        return handled

    def _parse_feature_line(
        self,
        line: str,
        current_lineage: Optional[Tuple[str, str]],
        current_culture: Optional[Tuple[str, str]],
    ) -> Optional[str]:
        lowered = line.lower()
        is_feature = lowered.startswith("feature")
        is_named_feature = ":" in line and not lowered.startswith("languages") and not lowered.endswith("features:")
        if not is_feature and not is_named_feature:
            return None
        container = self._current_container(current_lineage, current_culture)
        if not container:
            self.report.add_unparsed_line(line)
            return None
        if "-" in line:
            header, effect_text = line.split("-", 1)
        else:
            header, effect_text = line, ""
        name_part = header.split(":", 1)
        feature_name = (
            name_part[0].strip() if len(name_part) > 1 else header.replace("Feature", "").strip()
        )
        feature_id = self.store.add_feature(
            source_type=container[0],
            source_id=self._lookup_entity(container)["id"],
            name=feature_name,
            category=self.config.default_category,
            description=effect_text.strip(),
        )
        if effect_text.strip():
            self._parse_effect_fragments(effect_text.strip(), feature_id)
        return feature_id

    def _append_description(
        self,
        line: str,
        current_lineage: Optional[Tuple[str, str]],
        current_culture: Optional[Tuple[str, str]],
        current_feature_id: Optional[str] = None,
    ) -> bool:
        if current_feature_id:
            feature = self.store.features.get(self._feature_key_by_id(current_feature_id))
            if feature is not None:
                separator = "\n" if feature.get("description") else ""
                feature["description"] = f"{feature.get('description', '')}{separator}{line}"
                return True
        container = self._current_container(current_lineage, current_culture)
        if not container:
            return False
        entity = self._lookup_entity(container)
        separator = "\n" if entity.get("description") else ""
        entity["description"] = f"{entity.get('description', '')}{separator}{line}"
        return True

    def _feature_key_by_id(self, feature_id: str) -> Optional[str]:
        for key, feature in self.store.features.items():
            if feature.get("id") == feature_id:
                return key
        return None

    def _parse_effect_fragments(self, text: str, feature_id: str) -> None:
        fragments = self._split_fragments(text)
        for frag in fragments:
            effect_type, target = self._classify_target(frag)
            magnitude = self._extract_magnitude(frag, effect_type)
            conditions = self._extract_conditions(frag)
            if not effect_type or not magnitude:
                self.report.warnings.append(f"Skipped effect: {frag}")
                continue
            self.store.add_effect(
                feature_id=feature_id,
                effect_type=effect_type,
                target=target,
                magnitude=magnitude,
                applies_automatically="choice" not in frag.lower(),
                conditions=conditions,
            )

    def _split_fragments(self, text: str) -> List[str]:
        initial = [frag.strip() for frag in re.split(r"[.;]", text) if frag.strip()]
        fragments: List[str] = []
        for frag in initial:
            pieces = [piece.strip(" ,") for piece in re.split(r"(?=[+-]\d)", frag) if piece.strip(" ,")]
            fragments.extend(pieces if pieces else [frag])
        return fragments

    def _extract_conditions(self, text: str) -> List[Dict[str, object]]:
        conditions: List[Dict[str, object]] = []
        lowered = text.lower()

        def add(condition_type: str, condition_value: object) -> None:
            if {"condition_type": condition_type, "condition_value": condition_value} not in conditions:
                conditions.append({"condition_type": condition_type, "condition_value": condition_value})

        if "swamp" in lowered or "swampland" in lowered:
            add("environment", {"equals": "swampland"})
        if "dark" in lowered:
            add("lighting", {"equals": "darkness"})
        if "indoor" in lowered or "indoors" in lowered:
            add("environment", {"equals": "indoor"})
        if "adjacent" in lowered and "ally" in lowered:
            add("ally_state", "adjacent_ally")
        if "once per" in lowered:
            add("usage_frequency", "once")
        if "while" in lowered:
            add("while", text.split("while", 1)[-1].strip())
        if "when" in lowered:
            add("when", text.split("when", 1)[-1].strip())
        if "if" in lowered:
            add("if", text.split("if", 1)[-1].strip())
        if "against" in lowered:
            add("opponent", text.split("against", 1)[-1].strip())
        for match in re.findall(r"non-[A-Za-z' ]+", text, flags=re.IGNORECASE):
            add("opponent", match.strip())
        return conditions

    def _extract_magnitude(self, text: str, effect_type: Optional[str]) -> Optional[Dict[str, object]]:
        if effect_type == "deity_relationship_cap":
            cap_bonus = re.search(r"([+-]?\d+)\s*/\s*spiritual", text, flags=re.IGNORECASE)
            if cap_bonus:
                bonus_value = int(cap_bonus.group(1))
                step = 10 + bonus_value
                progression = {str(i): step * i for i in range(0, 7)}
                return {
                    "cap_progression": progression,
                    "cap_step": step,
                    "per_spiritual": bonus_value,
                }
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
        if "deity relationship" in lowered:
            return "deity_relationship_cap", {"type": "deity_relationship_cap"}
        if "psi" in lowered and "point" in lowered:
            return "resource_bonus", {"type": "resource", "code": "PSI_POINTS"}
        if "damage" in lowered:
            return "damage_modifier", {"type": "damage"}
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
    suffix = input_path.suffix.lower()
    if suffix == ".txt":
        return input_path.read_text(encoding="utf-8")
    if suffix == ".doc":  # pragma: no cover - runtime conversion
        antiword = shutil.which("antiword")
        if not antiword:
            raise SystemExit("antiword is required to convert .doc files. Install antiword or supply a .txt export.")
        result = subprocess.run([antiword, str(input_path)], check=True, capture_output=True)
        return result.stdout.decode("utf-8", errors="ignore")
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
        if args.validate_only:
            sys.exit(1)

    if args.validate_only:
        return

    emit_outputs(store, output_dir)
    print(f"Wrote JSON outputs to {output_dir}")


if __name__ == "__main__":
    main()
