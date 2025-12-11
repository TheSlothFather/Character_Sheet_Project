import React from "react";
import { useNavigate } from "react-router-dom";
import backgroundsData from "../../data/backgrounds.json";
import { api, BackgroundSelection, AttributeScores, ModifierWithSource } from "../../api/client";
import psionicsCsv from "../../data/psionics.csv?raw";
import { PSION_BACKGROUND_CONFIG, PSIONICS_STORAGE_KEY } from "../psionics/psionBackgrounds";
import { DEFAULT_PSI_POINTS, parsePsionicsCsv } from "../psionics/psionicsUtils";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";
import { applyModifiers } from "@shared/rules/modifiers";

const getSkillCode = (skill: { id: string; code?: string }): string => skill.code ?? skill.id;
const normalizeSkillCode = (skill: { id: string; code?: string; name: string }): string =>
  (skill.code ?? skill.id ?? skill.name).toUpperCase();

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
  MARTIAL_PROWESS: ["PHYSICAL", "WILL"],
  ILDAKAR_FACULTY: ["MENTAL", "SPIRITUAL"],
  PSIONIC_TECHNIQUE: ["MENTAL"],
  RESIST_PSIONICS: ["MENTAL"],
  BATTLE: ["PHYSICAL"],
  CONCEAL: ["PHYSICAL"],
  FORAGE: ["PHYSICAL", "MENTAL"],
  NAVIGATE: ["PHYSICAL", "SPIRITUAL"],
  RESIST_TOXINS: ["PHYSICAL"],
  SENSE_SUPERNATURAL: ["SPIRITUAL"],
  SEDUCE: ["PHYSICAL", "WILL"],
  FEAT_OF_AUSTERITY: ["WILL"],
  RESIST_SUPERNATURAL: ["SPIRITUAL"],
  FEAT_OF_STRENGTH: ["PHYSICAL"],
  FEAT_OF_AGILITY: ["PHYSICAL"],
  SEARCH: ["MENTAL"],
  IDENTIFY: ["MENTAL", "SPIRITUAL"],
  DECEIVE: ["MENTAL", "WILL"],
  TRACK: ["PHYSICAL", "MENTAL"],
  INTIMIDATE: ["PHYSICAL", "WILL"],
  WILL_DAKAR: ["WILL"],
  ACADEMIC_RECALL: ["MENTAL"],
  INTERPRET: ["MENTAL", "SPIRITUAL"],
  ENDURE: ["WILL"],
  CRAFT: ["PHYSICAL", "MENTAL"],
  ANIMAL_HUSBANDRY: ["PHYSICAL", "SPIRITUAL"],
  FEAT_OF_DEFIANCE: ["WILL"]
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
  category?: string;
  startingWealth?: string;
  startingEquipment?: string;
  feature?: string;
};

type PsionicsModalChoice = {
  backgroundName: string;
  required: number;
  options: { id: string; tree: string; name: string }[];
  selectedIds: string[];
};

type PsionicsModalState = {
  characterId: string;
  characterName: string;
  psiBonus: number;
  baseAbilityIds: string[];
  choices: PsionicsModalChoice[];
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

const computeAttributeSkillBonuses = (
  attributes: Record<(typeof ATTRIBUTE_KEYS)[number], number>,
  skills: { id: string; code?: string; name: string }[] | undefined
): Record<string, number> => {
  if (!skills) return {};
  const bonuses: Record<string, number> = {};
  skills.forEach((skill) => {
    const skillKey = normalizeSkillCode(skill);
    const attributesForSkill = skillAttributeMap[skillKey];
    if (!attributesForSkill) return;
    const code = getSkillCode(skill);
    bonuses[code] = attributesForSkill.reduce((acc, attr) => acc + attributes[attr] * 10, 0);
  });
  return bonuses;
};

const computeRaceSkillBonuses = (
  definitions: ReturnType<typeof useDefinitions>["data"] | undefined,
  raceKey: string,
  subraceKey: string
): Record<string, number> => {
  if (!definitions) return {};
  const baseSkills = Object.fromEntries(
    (definitions.skills ?? []).map((skill) => [getSkillCode(skill), { score: 0, racialBonus: 0 }])
  );
  const baseState = { skills: baseSkills } as Record<string, unknown>;

  const applicable = (definitions.modifiers as ModifierWithSource[]).filter((m) => {
    if (m.sourceType === "race") return m.sourceKey === raceKey;
    if (m.sourceType === "subrace") return m.sourceKey === subraceKey;
    return false;
  });

  const state = applyModifiers({ baseState, modifiers: applicable });
  const result: Record<string, number> = {};
  for (const skill of definitions.skills ?? []) {
    const code = getSkillCode(skill);
    const entry = (state.skills as Record<string, any> | undefined)?.[code];
    result[code] = typeof entry?.racialBonus === "number" ? entry.racialBonus : 0;
  }
  return result;
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
  const [backgroundSearch, setBackgroundSearch] = React.useState<Record<BackgroundStage, string>>({
    Family: "",
    Childhood: "",
    Adolescence: "",
    Adulthood: "",
    Flaws: "",
    "Inciting Incident": ""
  });
  const [adulthoodCategoryFilter, setAdulthoodCategoryFilter] = React.useState<string>("");

  const [name, setName] = React.useState("");
  const [raceKey, setRaceKey] = React.useState<string>("");
  const [subraceKey, setSubraceKey] = React.useState<string>("");
  const [psionicsModal, setPsionicsModal] = React.useState<PsionicsModalState | null>(null);
  const [selection, setSelection] = React.useState<BackgroundSelection>({ adulthood: [], flaws: [] });
  const [attributes, setAttributes] = React.useState<Record<(typeof ATTRIBUTE_KEYS)[number], number>>({
    PHYSICAL: 0,
    MENTAL: 0,
    SPIRITUAL: 0,
    WILL: 0
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const psionicAbilities = React.useMemo(() => parsePsionicsCsv(psionicsCsv), []);
  const psionicAbilityLookup = React.useMemo(
    () => new Map(psionicAbilities.map((ability) => [`${ability.tree}:${ability.name}`, ability])),
    [psionicAbilities]
  );
  const psionicAbilityById = React.useMemo(
    () => new Map(psionicAbilities.map((ability) => [ability.id, ability])),
    [psionicAbilities]
  );

  React.useEffect(() => {
    setLoadingBackgrounds(true);
    setBackgroundsError(null);
    try {
      const options: BackgroundOption[] = (backgroundsData as BackgroundOption[]).map((row) => ({
        stage: row.stage as BackgroundStage,
        name: row.name,
        details: row.details ?? "",
        category: row.category,
        startingWealth: row.startingWealth,
        startingEquipment: row.startingEquipment,
        feature: row.feature,
        fateBonus: parseFateBonus(row.details ?? "")
      }));
      setBackgroundOptions(options.filter((o) => Boolean(o.stage && o.name)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load backgrounds";
      setBackgroundsError(message);
    } finally {
      setLoadingBackgrounds(false);
    }
  }, []);

  const adulthoodCategories = React.useMemo(
    () =>
      Array.from(
        new Set(
          backgroundOptions
            .filter((opt) => opt.stage === "Adulthood" && opt.category)
            .map((opt) => opt.category as string)
        )
      ).sort(),
    [backgroundOptions]
  );

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

  const buildPsionicsModal = (characterId: string, characterName: string): PsionicsModalState | null => {
    const adulthoodBackgrounds = selection.adulthood ?? [];
    const baseAbilityIds = new Set<string>();
    let psiBonus = 0;
    const choices: PsionicsModalChoice[] = [];

    adulthoodBackgrounds.forEach((backgroundName) => {
      const config = PSION_BACKGROUND_CONFIG[backgroundName.toLowerCase() as keyof typeof PSION_BACKGROUND_CONFIG];
      if (!config) return;
      psiBonus += config.psiBonus;

      config.granted.forEach((grant) => {
        const ability = psionicAbilityLookup.get(`${grant.tree}:${grant.name}`);
        if (ability) baseAbilityIds.add(ability.id);
      });

      const options = config.options
        .map((option) => {
          const ability = psionicAbilityLookup.get(`${option.tree}:${option.name}`);
          return ability ? { id: ability.id, tree: option.tree, name: option.name } : null;
        })
        .filter(Boolean) as { id: string; tree: string; name: string }[];

      if (options.length > 0) {
        choices.push({
          backgroundName,
          required: config.picksRequired,
          options,
          selectedIds: []
        });
      }
    });

    if (choices.length === 0) return null;

    return {
      characterId,
      characterName,
      psiBonus,
      baseAbilityIds: Array.from(baseAbilityIds),
      choices
    };
  };

  const handleTogglePsionicOption = (backgroundIndex: number, abilityId: string) => {
    setPsionicsModal((prev) => {
      if (!prev) return prev;
      const nextChoices = prev.choices.map((choice, idx) => {
        if (idx !== backgroundIndex) return choice;
        const selected = new Set(choice.selectedIds);
        if (selected.has(abilityId)) {
          selected.delete(abilityId);
        } else {
          if (selected.size >= choice.required) return choice;
          selected.add(abilityId);
        }
        return { ...choice, selectedIds: Array.from(selected) };
      });
      return { ...prev, choices: nextChoices };
    });
  };

  const psionicsModalComplete = psionicsModal?.choices.every((choice) => choice.selectedIds.length === choice.required) ?? false;

  const persistPsionicChoices = () => {
    if (!psionicsModal) return;
    if (typeof window === "undefined") {
      setPsionicsModal(null);
      navigate("/characters");
      return;
    }

    const storageKey = `${PSIONICS_STORAGE_KEY}:${psionicsModal.characterId}`;
    const backgroundSelections = psionicsModal.choices.flatMap((choice) => choice.selectedIds);

    let existing: { psiPool?: number; purchased?: string[]; mental?: number; backgroundPicks?: string[] } = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) existing = JSON.parse(raw);
    } catch (err) {
      console.warn("Unable to parse existing psionics state", err);
    }

    const purchased = new Set(existing.purchased ?? []);
    [...psionicsModal.baseAbilityIds, ...backgroundSelections].forEach((id) => purchased.add(id));

    const psiPool = Math.max(
      DEFAULT_PSI_POINTS + psionicsModal.psiBonus,
      typeof existing.psiPool === "number" && existing.psiPool >= 0 ? existing.psiPool : 0
    );
    const mental = typeof existing.mental === "number" && existing.mental >= 0 ? existing.mental : attributes.MENTAL;

    const payload = {
      psiPool,
      mental,
      purchased: Array.from(purchased),
      backgroundPicks: backgroundSelections
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.warn("Unable to persist psionics state", err);
    }

    setPsionicsModal(null);
    navigate("/characters");
  };

  const closePsionicsModal = () => {
    setPsionicsModal(null);
    navigate("/characters");
  };

  const attributeTotal = Object.values(attributes).reduce((acc, v) => acc + v, 0);
  const attributeRemaining = ATTRIBUTE_POINT_POOL - attributeTotal;

  const attributeSkillBonuses = React.useMemo(
    () => computeAttributeSkillBonuses(attributes, definitions?.skills),
    [attributes, definitions]
  );

  const racialSkillBonuses = React.useMemo(
    () => computeRaceSkillBonuses(definitions, raceKey, subraceKey),
    [definitions, raceKey, subraceKey]
  );

  const skillBonuses = React.useMemo(() => {
    const bonuses: Record<string, number> = { ...racialSkillBonuses };
    Object.entries(attributeSkillBonuses).forEach(([code, bonus]) => {
      bonuses[code] = (bonuses[code] ?? 0) + bonus;
    });
    return bonuses;
  }, [attributeSkillBonuses, racialSkillBonuses]);

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
        skillBonuses,
        fatePoints: totalFatePoints
      });
      setSelectedId(created.id);

      const modalState = buildPsionicsModal(created.id, created.name);
      if (modalState) {
        setPsionicsModal(modalState);
      } else {
        navigate("/characters");
      }
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
    const searchTerm = (backgroundSearch[stage] ?? "").toLowerCase().trim();

    const filteredOptions = options.filter((opt) => {
      const haystack = [
        opt.name,
        opt.details,
        opt.category,
        opt.startingEquipment,
        opt.startingWealth,
        opt.feature
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !searchTerm || haystack.includes(searchTerm);
      const matchesCategory =
        stage !== "Adulthood" || !adulthoodCategoryFilter || opt.category === adulthoodCategoryFilter;
      return matchesSearch && matchesCategory;
    });

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={backgroundSearch[stage] ?? ""}
            onChange={(e) =>
              setBackgroundSearch((prev) => ({
                ...prev,
                [stage]: e.target.value
              }))
            }
            placeholder={`Search ${stage.toLowerCase()}...`}
            style={{ flex: 1 }}
          />
          {stage === "Adulthood" && (
            <select
              value={adulthoodCategoryFilter}
              onChange={(e) => setAdulthoodCategoryFilter(e.target.value)}
              style={{ minWidth: 180 }}
            >
              <option value="">All categories</option>
              {adulthoodCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}
        </div>
        {filteredOptions.length === 0 && <div style={{ color: "#9aa3b5" }}>No options found.</div>}
        <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredOptions.map((opt) => {
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
                <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{opt.name}</div>
                      {stage === "Adulthood" && opt.category && (
                        <div
                          style={{
                            display: "inline-block",
                            background: "#1f2a33",
                            border: "1px solid #2d343f",
                            borderRadius: 6,
                            padding: "2px 6px",
                            fontSize: 11,
                            marginTop: 4,
                            color: "#c8d0e0"
                          }}
                        >
                          {opt.category}
                        </div>
                      )}
                    </div>
                    {opt.fateBonus > 0 && (
                      <div style={{ color: "#9ae6b4", fontSize: 12, fontWeight: 700 }}>
                        +{opt.fateBonus} Fate Point(s)
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "#b7c0d3", whiteSpace: "pre-wrap" }}>{opt.details}</div>
                  {stage === "Adulthood" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 6 }}>
                      <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                        <strong style={{ color: "#e8edf7" }}>Starting Wealth: </strong>
                        {opt.startingWealth || "Not specified"}
                      </div>
                      <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                        <strong style={{ color: "#e8edf7" }}>Starting Equipment: </strong>
                        {opt.startingEquipment || "Not specified"}
                      </div>
                      <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                        <strong style={{ color: "#e8edf7" }}>Feature: </strong>
                        {opt.feature || "Not specified"}
                      </div>
                    </div>
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
    <>
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
                  <div style={{ fontWeight: 700 }}>
                    Distribute {ATTRIBUTE_POINT_POOL} points (min {ATTRIBUTE_MIN}, max {ATTRIBUTE_MAX})
                  </div>
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
                {(definitions?.skills ?? [])
                  .map((skill) => ({ skill, bonus: skillBonuses[getSkillCode(skill)] ?? 0 }))
                  .sort((a, b) => a.skill.name.localeCompare(b.skill.name))
                  .map(({ skill, bonus }) => (
                    <div
                      key={skill.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 120px",
                        padding: "0.35rem 0.25rem",
                        borderBottom: "1px solid #1f242d",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{skill.name}</div>
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

      {psionicsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem"
          }}
        >
          <div
            style={{
              ...cardStyle,
              width: "min(960px, 95vw)",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 10px 30px rgba(0,0,0,0.45)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9aa3b5" }}>Psionic unlocks</div>
                <h3 style={{ margin: 0 }}>Select Psionic Abilities</h3>
                <p style={{ margin: "4px 0", color: "#c5ccd9" }}>
                  {psionicsModal.characterName} qualifies for additional psionic techniques. Choose the required options now or
                  keep the defaults to pick later.
                </p>
              </div>
            </div>

            {psionicsModal.baseAbilityIds.length > 0 && (
              <div style={{ ...cardStyle, background: "#0e1318", borderColor: "#1f2935", marginBottom: 12 }}>
                <strong>Automatically granted:</strong>
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  {psionicsModal.baseAbilityIds.map((id) => {
                    const ability = psionicAbilityById.get(id);
                    return (
                      <li key={id} style={{ color: "#c5ccd9" }}>
                        {ability ? `${ability.name} (${ability.tree})` : id}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {psionicsModal.choices.map((choice, idx) => (
                <div key={`${choice.backgroundName}-${idx}`} style={{ ...cardStyle, background: "#0f151d", borderColor: "#1f2a33" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#9aa3b5" }}>Background</div>
                      <div style={{ fontWeight: 700 }}>{choice.backgroundName}</div>
                    </div>
                    <div style={{ fontSize: 13, color: "#c5ccd9" }}>
                      Choose {choice.selectedIds.length}/{choice.required}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                    {choice.options.map((option) => {
                      const ability = psionicAbilityById.get(option.id);
                      const isSelected = choice.selectedIds.includes(option.id);
                      const disableNewSelection = !isSelected && choice.selectedIds.length >= choice.required;
                      return (
                        <label
                          key={option.id}
                          style={{
                            border: isSelected ? "1px solid #f38b2f" : "1px solid #2d343f",
                            borderRadius: 8,
                            padding: "0.5rem 0.6rem",
                            background: isSelected ? "#1f2a33" : "#14171d",
                            display: "flex",
                            gap: 8,
                            cursor: disableNewSelection ? "not-allowed" : "pointer"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={disableNewSelection}
                            onChange={() => handleTogglePsionicOption(idx, option.id)}
                            style={{ marginTop: 4 }}
                          />
                          <div>
                            <div style={{ fontWeight: 700 }}>{ability?.name ?? option.name}</div>
                            <div style={{ fontSize: 12, color: "#9aa3b5" }}>{ability?.tree ?? option.tree}</div>
                            {ability?.description && (
                              <div style={{ fontSize: 12, color: "#c5ccd9", marginTop: 4 }}>
                                {ability.description.length > 180
                                  ? `${ability.description.slice(0, 180)}...`
                                  : ability.description}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button onClick={closePsionicsModal} style={{ padding: "0.55rem 0.9rem" }}>
                Decide later
              </button>
              <button
                onClick={persistPsionicChoices}
                disabled={!psionicsModalComplete}
                style={{ padding: "0.55rem 0.9rem", fontWeight: 700 }}
              >
                Save psionic picks
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
