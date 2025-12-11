import React from "react";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import backgroundsCsvUrl from "../../data/backgrounds.csv?url";
import { api, BackgroundSelection, AttributeScores } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";

const ATTRIBUTE_KEYS = ["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"] as const;
const ATTRIBUTE_POINT_POOL = 3;
const ATTRIBUTE_MIN = -1;
const ATTRIBUTE_MAX = 3;

const STAGE_REQUIREMENTS: Record<BackgroundStage, number> = {
  Family: 1,
  Childhood: 1,
  Adolescence: 1,
  Adulthood: 2,
  Flaws: 2,
  "Inciting Incident": 1
};

const skillAttributeMap: Record<string, (typeof ATTRIBUTE_KEYS)[number][]> = {
  Battle: ["PHYSICAL"],
  "Feat of Strength": ["PHYSICAL"],
  "Feat of Agility": ["PHYSICAL"],
  Conceal: ["PHYSICAL"],
  "Resist Toxins": ["PHYSICAL"],
  "Psionic Technique": ["MENTAL"],
  "Academic Recall": ["MENTAL"],
  Translate: ["MENTAL"],
  Search: ["MENTAL"],
  "Resist Psionics": ["MENTAL"],
  Worship: ["SPIRITUAL"],
  "Sense Supernatural": ["SPIRITUAL"],
  "Resist Supernatural": ["SPIRITUAL"],
  "Attune Wonderous Item": ["SPIRITUAL"],
  "Divine Intervention": ["SPIRITUAL"],
  "Will Dakar": ["WILL"],
  Endure: ["WILL"],
  Persevere: ["WILL"],
  "Feat of Austerity": ["WILL"],
  "Feat of Defiance": ["WILL"],
  Track: ["PHYSICAL", "MENTAL"],
  Craft: ["PHYSICAL", "MENTAL"],
  Forage: ["PHYSICAL", "MENTAL"],
  Navigate: ["PHYSICAL", "SPIRITUAL"],
  Heal: ["PHYSICAL", "SPIRITUAL"],
  "Animal Husbandry": ["PHYSICAL", "SPIRITUAL"],
  Intimidate: ["PHYSICAL", "WILL"],
  Seduce: ["PHYSICAL", "WILL"],
  Perform: ["PHYSICAL", "WILL"],
  Trade: ["MENTAL", "WILL"],
  "Gather Intelligence": ["MENTAL", "WILL"],
  Deceive: ["MENTAL", "WILL"],
  Interpret: ["MENTAL", "SPIRITUAL"],
  Deduce: ["MENTAL", "SPIRITUAL"],
  Identify: ["MENTAL", "SPIRITUAL"],
  Parley: ["WILL", "SPIRITUAL"],
  Artistry: ["WILL", "SPIRITUAL"],
  "Incite Fate": ["WILL", "SPIRITUAL"]
};

type BackgroundStage =
  | "Family"
  | "Childhood"
  | "Adolescence"
  | "Adulthood"
  | "Flaws"
  | "Inciting Incident";

type BackgroundOption = {
  stage: BackgroundStage;
  name: string;
  details: string;
  fateBonus: number;
};

const parseFateBonus = (details: string): number => {
  const match = details.match(/([+]+)?\s*(\d+)\s*fate\s*point/i);
  return match ? parseInt(match[2], 10) : 0;
};

const buildAttributeScores = (values: Record<(typeof ATTRIBUTE_KEYS)[number], number>): AttributeScores => {
  const scores: AttributeScores = {};
  ATTRIBUTE_KEYS.forEach((key) => {
    scores[key] = values[key];
  });
  return scores;
};

const computeSkillBonuses = (attributes: Record<(typeof ATTRIBUTE_KEYS)[number], number>): Record<string, number> => {
  const bonuses: Record<string, number> = {};
  Object.entries(skillAttributeMap).forEach(([skill, attrs]) => {
    bonuses[skill] = attrs.reduce((acc, attr) => acc + attributes[attr] * 10, 0);
  });
  return bonuses;
};

const cardStyle: React.CSSProperties = {
  background: "#12141a",
  border: "1px solid #2d343f",
  borderRadius: 10,
  padding: "0.75rem",
  color: "#e8edf7"
};

export const CharacterCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedId } = useSelectedCharacter();
  const { data: definitions, loading: definitionsLoading, error: definitionsError } = useDefinitions();

  const [backgroundOptions, setBackgroundOptions] = React.useState<BackgroundOption[]>([]);
  const [backgroundsError, setBackgroundsError] = React.useState<string | null>(null);
  const [loadingBackgrounds, setLoadingBackgrounds] = React.useState(true);

  const [name, setName] = React.useState("");
  const [raceKey, setRaceKey] = React.useState<string>("");
  const [subraceKey, setSubraceKey] = React.useState<string>("");
  const [selection, setSelection] = React.useState<BackgroundSelection>({ adulthood: [], flaws: [] });
  const [attributes, setAttributes] = React.useState<Record<(typeof ATTRIBUTE_KEYS)[number], number>>({
    PHYSICAL: 0,
    MENTAL: 0,
    SPIRITUAL: 0,
    WILL: 0
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoadingBackgrounds(true);
    setBackgroundsError(null);
    fetch(backgroundsCsvUrl)
      .then((res) => res.text())
      .then((text) => {
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        if (!parsed.data || !Array.isArray(parsed.data)) throw new Error("Invalid background CSV");
        const options: BackgroundOption[] = (parsed.data as Papa.ParseResult<BackgroundOption>["data"]).map((row) => ({
          stage: row.stage as BackgroundStage,
          name: row.name,
          details: row.details,
          fateBonus: parseFateBonus(row.details)
        }));
        setBackgroundOptions(options.filter((o) => Boolean(o.stage && o.name)));
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load backgrounds";
        setBackgroundsError(message);
      })
      .finally(() => setLoadingBackgrounds(false));
  }, []);

  const availableSubraces = React.useMemo(
    () =>
      (definitions?.subraces ?? []).filter((s) => !raceKey || (s.parentId ? s.parentId === raceKey : true)),
    [definitions, raceKey]
  );

  const handleSingleSelect = (key: keyof BackgroundSelection, value: string) => {
    setSelection((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const handleMultiSelect = (key: "adulthood" | "flaws", value: string, limit: number) => {
    setSelection((prev) => {
      const existing = new Set(prev[key] ?? []);
      if (existing.has(value)) {
        existing.delete(value);
      } else {
        if (existing.size >= limit) return prev;
        existing.add(value);
      }
      return { ...prev, [key]: Array.from(existing) };
    });
  };

  const adjustAttribute = (key: (typeof ATTRIBUTE_KEYS)[number], delta: number) => {
    setAttributes((prev) => {
      const next = { ...prev, [key]: Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, prev[key] + delta)) };
      const total = Object.values(next).reduce((acc, v) => acc + v, 0);
      if (total > ATTRIBUTE_POINT_POOL) return prev;
      return next;
    });
  };

  const attributeTotal = Object.values(attributes).reduce((acc, v) => acc + v, 0);
  const attributeRemaining = ATTRIBUTE_POINT_POOL - attributeTotal;

  const skillBonuses = React.useMemo(() => computeSkillBonuses(attributes), [attributes]);

  const selectedBackgrounds = React.useMemo(() => {
    const lookup = new Map<string, BackgroundOption>();
    backgroundOptions.forEach((opt) => lookup.set(`${opt.stage}:${opt.name}`, opt));
    const picks: BackgroundOption[] = [];
    const pushIf = (stage: BackgroundStage, value?: string | null) => {
      if (!value) return;
      const found = lookup.get(`${stage}:${value}`);
      if (found) picks.push(found);
    };
    pushIf("Family", selection.family);
    pushIf("Childhood", selection.childhood);
    pushIf("Adolescence", selection.adolescence);
    (selection.adulthood ?? []).forEach((v) => pushIf("Adulthood", v));
    (selection.flaws ?? []).forEach((v) => pushIf("Flaws", v));
    pushIf("Inciting Incident", selection.incitingIncident);
    return picks;
  }, [backgroundOptions, selection]);

  const bonusFatePoints = selectedBackgrounds.reduce((acc, b) => acc + b.fateBonus, 0);
  const totalFatePoints = 3 + bonusFatePoints;

  const missingStages = React.useMemo(() => {
    const result: string[] = [];
    (Object.keys(STAGE_REQUIREMENTS) as BackgroundStage[]).forEach((stage) => {
      const required = STAGE_REQUIREMENTS[stage];
      const current =
        stage === "Adulthood"
          ? (selection.adulthood ?? []).length
          : stage === "Flaws"
          ? (selection.flaws ?? []).length
          : selection[
              stage === "Inciting Incident"
                ? "incitingIncident"
                : (stage.toLowerCase() as keyof BackgroundSelection)
            ]
          ? 1
          : 0;
      if (current !== required) result.push(`${stage} (${current}/${required})`);
    });
    return result;
  }, [selection]);

  const canSubmit =
    name.trim().length > 0 &&
    !loadingBackgrounds &&
    !definitionsLoading &&
    missingStages.length === 0 &&
    attributeRemaining === 0;

  const onSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: BackgroundSelection = {
        family: selection.family,
        childhood: selection.childhood,
        adolescence: selection.adolescence,
        adulthood: selection.adulthood,
        flaws: selection.flaws,
        incitingIncident: selection.incitingIncident
      };

      const created = await api.createCharacter({
        name: name.trim(),
        level: 1,
        raceKey: raceKey || undefined,
        subraceKey: subraceKey || undefined,
        skillPoints: 100,
        skillAllocations: {},
        backgrounds: payload,
        attributes: buildAttributeScores(attributes),
        fatePoints: totalFatePoints
      });
      setSelectedId(created.id);
      navigate("/characters");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create character";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderBackgroundSection = (stage: BackgroundStage, key: keyof BackgroundSelection, limit: number) => {
    const options = backgroundOptions.filter((opt) => opt.stage === stage);
    const multi = stage === "Adulthood" || stage === "Flaws";
    const selected = selection[key];

    return (
      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#9aa3b5" }}>{stage}</div>
            <div style={{ fontWeight: 700 }}>
              Choose {limit} ({multi ? `${(selected as string[] | undefined)?.length ?? 0}` : selected ? 1 : 0}/{limit})
            </div>
          </div>
        </div>
        {options.length === 0 && <div style={{ color: "#9aa3b5" }}>No options found.</div>}
        <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map((opt) => {
            const checked = multi
              ? (selected as string[] | undefined)?.includes(opt.name)
              : (selected as string | undefined) === opt.name;
            return (
              <label
                key={`${stage}-${opt.name}`}
                style={{
                  border: checked ? "1px solid #f38b2f" : "1px solid #2d343f",
                  borderRadius: 8,
                  padding: "0.5rem 0.6rem",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  background: checked ? "#1f2a33" : "#14171d",
                  cursor: "pointer"
                }}
              >
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={stage}
                  checked={checked}
                  onChange={() =>
                    multi
                      ? handleMultiSelect(key as "adulthood" | "flaws", opt.name, limit)
                      : handleSingleSelect(key, opt.name)
                  }
                  style={{ marginTop: 4 }}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>{opt.name}</div>
                  <div style={{ fontSize: 13, color: "#b7c0d3", whiteSpace: "pre-wrap" }}>{opt.details}</div>
                  {opt.fateBonus > 0 && (
                    <div style={{ color: "#9ae6b4", fontSize: 12, marginTop: 4 }}>+{opt.fateBonus} Fate Point(s)</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAttributeRow = (key: (typeof ATTRIBUTE_KEYS)[number]) => {
    const value = attributes[key];
    return (
      <div
        key={key}
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr 1fr",
          gap: 8,
          alignItems: "center"
        }}
      >
        <div style={{ fontWeight: 700 }}>{key}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => adjustAttribute(key, -1)} disabled={value <= ATTRIBUTE_MIN}>
            -
          </button>
          <div style={{ width: 32, textAlign: "center" }}>{value}</div>
          <button onClick={() => adjustAttribute(key, 1)} disabled={value >= ATTRIBUTE_MAX || attributeRemaining <= 0}>
            +
          </button>
        </div>
        <div style={{ fontSize: 13, color: "#9aa3b5" }}>Affects linked skills by ±10 per point</div>
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem" }}>Character Creation</h2>
      {(definitionsError || backgroundsError || submitError) && (
        <p style={{ color: "#f55" }}>{definitionsError || backgroundsError || submitError}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "1rem" }}>
        <aside style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#9aa3b5", marginBottom: 4 }}>Name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Character name" disabled={submitting} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#9aa3b5", marginBottom: 4 }}>Race</div>
            <select
              value={raceKey}
              onChange={(e) => {
                setRaceKey(e.target.value);
                setSubraceKey("");
              }}
              disabled={definitionsLoading || submitting}
              style={{ width: "100%" }}
            >
              <option value="">Select race</option>
              {(definitions?.races ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#9aa3b5", marginBottom: 4 }}>Subrace</div>
            <select
              value={subraceKey}
              onChange={(e) => setSubraceKey(e.target.value)}
              disabled={definitionsLoading || submitting}
              style={{ width: "100%" }}
            >
              <option value="">Select subrace</option>
              {availableSubraces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#9aa3b5", marginBottom: 4 }}>Attribute Points</div>
            <div style={{ fontWeight: 700, color: attributeRemaining === 0 ? "#9ae6b4" : "#f7a046" }}>
              {attributeRemaining} remaining (min {ATTRIBUTE_MIN}, max {ATTRIBUTE_MAX})
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#9aa3b5", marginBottom: 4 }}>Fate Points</div>
            <div style={{ fontWeight: 700 }}>
              Base 3 {bonusFatePoints > 0 ? `+ ${bonusFatePoints} from backgrounds = ${totalFatePoints}` : `= ${totalFatePoints}`}
            </div>
          </div>
          <button onClick={onSubmit} disabled={!canSubmit || submitting} style={{ padding: "0.6rem 0.8rem" }}>
            {submitting ? "Creating..." : "Create Character"}
          </button>
          {missingStages.length > 0 && (
            <div style={{ fontSize: 12, color: "#f7a046" }}>
              Select required options: {missingStages.join(", ")}
            </div>
          )}
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
            {renderBackgroundSection("Family", "family", STAGE_REQUIREMENTS.Family)}
            {renderBackgroundSection("Childhood", "childhood", STAGE_REQUIREMENTS.Childhood)}
            {renderBackgroundSection("Adolescence", "adolescence", STAGE_REQUIREMENTS.Adolescence)}
            {renderBackgroundSection("Adulthood", "adulthood", STAGE_REQUIREMENTS.Adulthood)}
            {renderBackgroundSection("Flaws", "flaws", STAGE_REQUIREMENTS.Flaws)}
            {renderBackgroundSection("Inciting Incident", "incitingIncident", STAGE_REQUIREMENTS["Inciting Incident"])}
          </div>

          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "#9aa3b5" }}>Attributes</div>
                <div style={{ fontWeight: 700 }}>Distribute {ATTRIBUTE_POINT_POOL} points (min {ATTRIBUTE_MIN}, max {ATTRIBUTE_MAX})</div>
              </div>
              <div style={{ fontSize: 13, color: attributeRemaining === 0 ? "#9ae6b4" : "#f7a046" }}>
                Remaining: {attributeRemaining}
              </div>
            </div>
            {ATTRIBUTE_KEYS.map(renderAttributeRow)}
          </div>

          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#9aa3b5" }}>Skill Adjustments</div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {Object.entries(skillBonuses)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([skill, bonus]) => (
                  <div
                    key={skill}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 120px",
                      padding: "0.35rem 0.25rem",
                      borderBottom: "1px solid #1f242d",
                      alignItems: "center"
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{skill}</div>
                    <div style={{ fontWeight: 700, color: bonus >= 0 ? "#9ae6b4" : "#f7a046", textAlign: "right" }}>
                      {bonus >= 0 ? "+" : ""}
                      {bonus}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
