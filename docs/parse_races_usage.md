# Race and Skills Parser

`tools/parse_races.py` reads `Race and Skills.doc` after conversion to plain text
(via `pandoc` for `.docx` and `antiword` for `.doc`) and emits normalized JSON
aligned with the schema described in `ttrpg_data_schema.md`.

## Prerequisites
- Python 3.10+ (standard library only)
- `antiword` on PATH for `.doc` conversion (or provide a `.txt` export)
- `pandoc` on PATH for `.docx` conversion

## CLI
```
python tools/parse_races.py --input "Race and Skills.doc" --output out_dir
python tools/parse_races.py --input converted.txt --output out_dir --validate-only
python tools/parse_races.py --input Race\ and\ Skills.doc --output out_dir --mapping tools/mappings.json
```
- `--validate-only` stops after parsing and returns non-zero when unparsed lines
  remain.
- `--mapping` accepts a JSON file with alias overrides and a custom `pandoc`
  binary.

## Output files
- `attributes.json`
- `skills.json`
- `languages.json`
- `lineages.json`
- `cultures.json`
- `features.json` (separate from effects for normalization)
- `effects.json` (atomic entries with optional conditions)
- IDs are deterministic and human-readable (e.g., `LIN_ININ`,
  `CUL_ININ_ECTHVASIN`, `FEAT_LIN_ININ_FEROCITY`).

## Sample conversion
`docs/sample_race_text.txt` mirrors a small slice of the source file. Running:
```
python tools/parse_races.py --input docs/sample_race_text.txt --output docs/sample_output
```
produces machine-ready JSON demonstrating:
- Baseline lineage/culture bonuses.
- Feature/effect separation with conditional swampland movement and skill
  bonuses.
- Action economy normalization for a free-action item swap with frequency
  gating.

Refer to `docs/sample_output/*.json` for concrete examples of the generated
structures.
