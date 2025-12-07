from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from tools.parse_races import ParserConfig, RaceParser, convert_input_to_text
import pytest


def test_parses_sample_text_without_errors():
    text = Path("docs/sample_race_text.txt").read_text()
    parser = RaceParser(ParserConfig())
    store, report = parser.parse(text)

    assert not report.has_errors()
    assert any(feature["code"] == "MAGICALLY_INCLINED" for feature in store.features.values())
    swamper_effects = [
        effect for effect in store.effects if effect["effect_type"] == "movement_mod"
    ]
    assert any(effect["conditions"] for effect in swamper_effects)


def test_convert_input_accepts_plain_text(tmp_path):
    input_txt = tmp_path / "input.txt"
    input_txt.write_text("hello world", encoding="utf-8")
    text = convert_input_to_text(input_txt, pandoc_binary="pandoc")
    assert text == "hello world"


def test_convert_input_reports_missing_pandoc(monkeypatch, tmp_path):
    missing_doc = tmp_path / "input.doc"
    missing_doc.write_text("irrelevant", encoding="utf-8")

    def fake_run(*args, **kwargs):
        raise FileNotFoundError()

    monkeypatch.setattr("subprocess.run", fake_run)
    with pytest.raises(SystemExit):
        convert_input_to_text(missing_doc, pandoc_binary="pandoc")
