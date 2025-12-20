import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import backgroundsData from "../../data/backgrounds.json";
import { api, BackgroundSelection, AttributeScores, ModifierWithSource, RaceDetailProfile } from "../../api/client";
import psionicsCsv from "../../data/psionics.csv?raw";
import { PSION_BACKGROUND_CONFIG, PSIONICS_STORAGE_KEY } from "../psionics/psionBackgrounds";
import { parsePsionicsCsv } from "../psionics/psionicsUtils";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";
import { applyModifiers } from "@shared/rules/modifiers";
import "./CharacterCreationPage.css";
import {
  AttributeKey,
  getSkillCode,
  normalizeSkillCode,
  computeAttributeSkillBonuses
} from "./skillMetadata";
const ATTRIBUTE_KEYS: AttributeKey[] = ["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"] as const;
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

const buildAttributeScores = (values: Record<AttributeKey, number>): AttributeScores => {
  const scores: AttributeScores = {};
  ATTRIBUTE_KEYS.forEach((key) => {
    scores[key] = values[key];
  });
  return scores;
};

const computeRaceSkillBonuses = (
  definitions: ReturnType<typeof useDefinitions>["data"] | undefined,
  raceKey: string,
  subraceKey: string,
  raceDetails: Record<string, RaceDetailProfile>
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

  const result: Record<string, number> = {};
  const modifiedSkills = new Set<string>();
  const state = applyModifiers({ baseState, modifiers: applicable });
  for (const skill of definitions.skills ?? []) {
    const code = getSkillCode(skill);
    const entry = (state.skills as Record<string, any> | undefined)?.[code];
    result[code] = typeof entry?.racialBonus === "number" ? entry.racialBonus : 0;
    if (typeof entry?.racialBonus === "number") {
      modifiedSkills.add(code);
    }
  }

  const addRaceDetailBonuses = (key: string | undefined) => {
    if (!key) return;
    const details = raceDetails[key];
    if (!details?.skills) return;
    Object.entries(details.skills).forEach(([code, value]) => {
      if (typeof value !== "number") return;
      if (modifiedSkills.has(code)) return;
      result[code] = (result[code] ?? 0) + value;
    });
  };

  addRaceDetailBonuses(raceKey);
  addRaceDetailBonuses(subraceKey);

  return result;
};

const computeBackgroundSkillBonuses = (
  backgrounds: BackgroundOption[],
  skills: { id: string; code?: string; name: string }[] | undefined
): Record<string, number> => {
  if (!skills?.length) return {};

  const bonuses: Record<string, number> = {};
  const skillLookup = new Map<string, string>();

  skills.forEach((skill) => {
    const key = normalizeSkillCode(skill);
    skillLookup.set(key, getSkillCode(skill));
  });

  const parseDetails = (details: string): { code: string; value: number }[] => {
    const cleaned = details.replace(/[\[\]]/g, "");
    return cleaned
      .split(/[,;]/)
      .map((part) => part.trim())
      .map((part) => {
        const match = part.match(/([+-]?\d+)\s+(.+)/);
        if (!match) return null;
        const value = parseInt(match[1], 10);
        const skillName = match[2].trim();
        const normalized = normalizeSkillCode({ name: skillName });
        const code = skillLookup.get(normalized);
        if (!code || Number.isNaN(value)) return null;
        return { code, value };
      })
      .filter(Boolean) as { code: string; value: number }[];
  };

  backgrounds.forEach((background) => {
    const entries = parseDetails(background.details ?? "");
    entries.forEach(({ code, value }) => {
      bonuses[code] = (bonuses[code] ?? 0) + value;
    });
  });

  return bonuses;
};

const HIDDEN_SKILL_CODES = new Set(["MARTIAL_PROWESS", "ILDAKAR_FACULTY"]);

export const CharacterCreationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaignId")?.trim() || undefined;
  const returnPath = campaignId ? `/player/campaigns/${campaignId}/characters` : "/player/characters";
  const { setSelectedId } = useSelectedCharacter();
  const { data: definitions, loading: definitionsLoading, error: definitionsError } = useDefinitions();
  const raceDetails = (definitions?.raceDetails ?? {}) as Record<string, RaceDetailProfile>;

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

  const selectedRaceDetail = React.useMemo(() => (raceKey ? raceDetails[raceKey] : undefined), [raceDetails, raceKey]);
  const selectedSubraceDetail = React.useMemo(() => (subraceKey ? raceDetails[subraceKey] : undefined), [raceDetails, subraceKey]);

  const combinedDisciplines = React.useMemo(() => {
    const totals = { martialProwess: 0, ildakarFaculty: 0, psiPoints: 0, deityCapPerSpirit: 0 };
    [selectedRaceDetail, selectedSubraceDetail].forEach((detail) => {
      if (!detail) return;
      const bonuses = detail.disciplines ?? {};
      totals.martialProwess += bonuses.martialProwess ?? 0;
      totals.ildakarFaculty += bonuses.ildakarFaculty ?? 0;
      totals.psiPoints += bonuses.psiPoints ?? 0;
      totals.deityCapPerSpirit += bonuses.deityCapPerSpirit ?? detail.deityCapPerSpirit ?? 0;
    });
    return totals;
  }, [selectedRaceDetail, selectedSubraceDetail]);

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
      const normalizedKey = backgroundName.trim().toLowerCase() as keyof typeof PSION_BACKGROUND_CONFIG;
      const config = PSION_BACKGROUND_CONFIG[normalizedKey];
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
      navigate(returnPath);
      return;
    }

    const storageKey = `${PSIONICS_STORAGE_KEY}:${psionicsModal.characterId}`;
    const backgroundSelections = psionicsModal.choices.flatMap((choice) => choice.selectedIds);

    let existing: { purchased?: string[]; backgroundPicks?: string[] } = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) existing = JSON.parse(raw);
    } catch (err) {
      console.warn("Unable to parse existing psionics state", err);
    }

    const purchased = new Set(existing.purchased ?? []);
    const backgroundPicks = new Set([...(existing.backgroundPicks ?? []), ...backgroundSelections]);
    psionicsModal.baseAbilityIds.forEach((id) => backgroundPicks.add(id));

    backgroundPicks.forEach((id) => purchased.delete(id));

    const payload = {
      purchased: Array.from(purchased),
      backgroundPicks: Array.from(backgroundPicks)
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.warn("Unable to persist psionics state", err);
    }

    setPsionicsModal(null);
    navigate(returnPath);
  };

  const closePsionicsModal = () => {
    setPsionicsModal(null);
    navigate(returnPath);
  };

  const attributeTotal = Object.values(attributes).reduce((acc, v) => acc + v, 0);
  const attributeRemaining = ATTRIBUTE_POINT_POOL - attributeTotal;

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

  const attributeSkillBonuses = React.useMemo(
    () => computeAttributeSkillBonuses(attributes, definitions?.skills),
    [attributes, definitions]
  );

  const racialSkillBonuses = React.useMemo(
    () => computeRaceSkillBonuses(definitions, raceKey, subraceKey, raceDetails),
    [definitions, raceDetails, raceKey, subraceKey]
  );

  const skillBonusesWithDisciplines = React.useMemo(() => ({ ...racialSkillBonuses }), [racialSkillBonuses]);

  const backgroundSkillBonuses = React.useMemo(
    () => computeBackgroundSkillBonuses(selectedBackgrounds, definitions?.skills),
    [definitions?.skills, selectedBackgrounds]
  );

  const skillBonuses = React.useMemo(() => {
    const bonuses: Record<string, number> = { ...skillBonusesWithDisciplines };
    Object.entries(backgroundSkillBonuses).forEach(([code, bonus]) => {
      if (HIDDEN_SKILL_CODES.has(code)) return;
      bonuses[code] = (bonuses[code] ?? 0) + bonus;
    });
    Object.entries(attributeSkillBonuses).forEach(([code, bonus]) => {
      if (HIDDEN_SKILL_CODES.has(code)) return;
      bonuses[code] = (bonuses[code] ?? 0) + bonus;
    });
    return bonuses;
  }, [attributeSkillBonuses, backgroundSkillBonuses, skillBonusesWithDisciplines]);

  const sortedSkills = React.useMemo(
    () =>
      [...(definitions?.skills ?? [])]
        .filter((skill) => !HIDDEN_SKILL_CODES.has(getSkillCode(skill)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [definitions]
  );

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
        campaignId,
        raceKey: raceKey || undefined,
        subraceKey: subraceKey || undefined,
        attributePointsAvailable: 0,
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
        navigate(returnPath);
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
      <div className="character-creation__card character-creation__section">
        <div className="character-creation__section-header">
          <div>
            <div className="character-creation__section-title caption muted">{stage}</div>
            <div className="character-creation__section-subtitle h3">
              Choose {limit} ({multi ? `${(selected as string[] | undefined)?.length ?? 0}` : selected ? 1 : 0}/{limit})
            </div>
          </div>
        </div>
        <div className="character-creation__control-row">
          <input
            value={backgroundSearch[stage] ?? ""}
            onChange={(e) =>
              setBackgroundSearch((prev) => ({
                ...prev,
                [stage]: e.target.value
              }))
            }
            placeholder={`Search ${stage.toLowerCase()}...`}
            className="character-creation__input character-creation__input--grow"
          />
          {stage === "Adulthood" && (
            <select
              value={adulthoodCategoryFilter}
              onChange={(e) => setAdulthoodCategoryFilter(e.target.value)}
              className="character-creation__select character-creation__select--compact"
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
        {filteredOptions.length === 0 && <div className="character-creation__muted">No options found.</div>}
        <div className="character-creation__options">
          {filteredOptions.map((opt) => {
            const checked = multi
              ? (selected as string[] | undefined)?.includes(opt.name)
              : (selected as string | undefined) === opt.name;
            return (
              <label
                key={`${stage}-${opt.name}`}
                className={`character-creation__option${checked ? " character-creation__option--selected" : ""}`}
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
                  className="character-creation__option-input"
                />
                <div className="character-creation__option-body">
                  <div className="character-creation__option-header">
                    <div>
                      <div className="character-creation__option-title">{opt.name}</div>
                      {stage === "Adulthood" && opt.category && (
                        <div className="character-creation__tag">{opt.category}</div>
                      )}
                    </div>
                    {opt.fateBonus > 0 && (
                      <div className="character-creation__bonus character-creation__bonus--positive">
                        +{opt.fateBonus} Fate Point(s)
                      </div>
                    )}
                  </div>
                  <div className="character-creation__option-details">{opt.details}</div>
                  {stage === "Adulthood" && (
                    <div className="character-creation__option-meta">
                      <div>
                        <strong>Starting Wealth: </strong>
                        {opt.startingWealth || "Not specified"}
                      </div>
                      <div>
                        <strong>Starting Equipment: </strong>
                        {opt.startingEquipment || "Not specified"}
                      </div>
                      <div>
                        <strong>Feature: </strong>
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
      <div key={key} className="character-creation__attribute-row">
        <div className="character-creation__attribute-label">{key}</div>
        <div className="character-creation__attribute-controls">
          <button
            onClick={() => adjustAttribute(key, -1)}
            disabled={value <= ATTRIBUTE_MIN}
            className="character-creation__mini-button"
          >
            -
          </button>
          <div className="character-creation__attribute-value">{value}</div>
          <button
            onClick={() => adjustAttribute(key, 1)}
            disabled={value >= ATTRIBUTE_MAX || attributeRemaining <= 0}
            className="character-creation__mini-button"
          >
            +
          </button>
        </div>
        <div className="character-creation__muted">Affects linked skills by ±10 per point</div>
      </div>
    );
  };

  return (
    <>
      <div className="character-creation">
        <h2 className="character-creation__title h2">Character Creation</h2>
        {(definitionsError || backgroundsError || submitError) && (
          <p className="character-creation__error">{definitionsError || backgroundsError || submitError}</p>
        )}
        <div className="character-creation__layout">
          <aside className="character-creation__card character-creation__sidebar">
            <div>
              <div className="character-creation__label">Name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Character name"
                disabled={submitting}
                className="character-creation__input"
              />
            </div>
            <div>
              <div className="character-creation__label">Race</div>
              <select
                value={raceKey}
                onChange={(e) => {
                  setRaceKey(e.target.value);
                  setSubraceKey("");
                }}
                disabled={definitionsLoading || submitting}
                className="character-creation__select"
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
              <div className="character-creation__label">Subrace</div>
              <select
                value={subraceKey}
                onChange={(e) => setSubraceKey(e.target.value)}
                disabled={definitionsLoading || submitting}
                className="character-creation__select"
              >
                <option value="">Select subrace</option>
                {availableSubraces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {(selectedRaceDetail || selectedSubraceDetail) && (
              <div className="character-creation__card character-creation__card--subtle">
                <div className="character-creation__label character-creation__label--tight">Discipline Bonuses</div>
                <div className="character-creation__discipline-grid">
                  <div>
                    <div className="character-creation__muted">Martial Prowess</div>
                    <div className="character-creation__value">{combinedDisciplines.martialProwess}</div>
                  </div>
                  <div>
                    <div className="character-creation__muted">Ildakar Faculty</div>
                    <div className="character-creation__value">{combinedDisciplines.ildakarFaculty}</div>
                  </div>
                  <div>
                    <div className="character-creation__muted">Psi-Points</div>
                    <div className="character-creation__value">{combinedDisciplines.psiPoints}</div>
                  </div>
                  <div>
                    <div className="character-creation__muted">Deity Cap / Spiritual</div>
                    <div className="character-creation__value">{combinedDisciplines.deityCapPerSpirit}</div>
                  </div>
                </div>
              </div>
            )}
            <div>
              <div className="character-creation__label">Attribute Points</div>
              <div
                className={`character-creation__status${
                  attributeRemaining === 0 ? " character-creation__status--good" : " character-creation__status--warn"
                }`}
              >
                {attributeRemaining} remaining (min {ATTRIBUTE_MIN}, max {ATTRIBUTE_MAX})
              </div>
            </div>
            <div>
              <div className="character-creation__label">Fate Points</div>
              <div className="character-creation__value">
                Base 3{" "}
                {bonusFatePoints > 0 ? `+ ${bonusFatePoints} from backgrounds = ${totalFatePoints}` : `= ${totalFatePoints}`}
              </div>
            </div>
            <button
              onClick={onSubmit}
              disabled={!canSubmit || submitting}
              className="character-creation__button character-creation__button--primary"
            >
              {submitting ? "Creating..." : "Create Character"}
            </button>
            {missingStages.length > 0 && (
              <div className="character-creation__warning">Select required options: {missingStages.join(", ")}</div>
            )}
          </aside>

          <div className="character-creation__content">
            <div className="character-creation__grid">
              {renderBackgroundSection("Family", "family", STAGE_REQUIREMENTS.Family)}
              {renderBackgroundSection("Childhood", "childhood", STAGE_REQUIREMENTS.Childhood)}
              {renderBackgroundSection("Adolescence", "adolescence", STAGE_REQUIREMENTS.Adolescence)}
              {renderBackgroundSection("Adulthood", "adulthood", STAGE_REQUIREMENTS.Adulthood)}
              {renderBackgroundSection("Flaws", "flaws", STAGE_REQUIREMENTS.Flaws)}
              {renderBackgroundSection("Inciting Incident", "incitingIncident", STAGE_REQUIREMENTS["Inciting Incident"])}
            </div>

            <div className="character-creation__card character-creation__section">
              <div className="character-creation__section-header">
                <div>
                  <div className="character-creation__section-title caption muted">Attributes</div>
                  <div className="character-creation__section-subtitle h3">
                    Distribute {ATTRIBUTE_POINT_POOL} points (min {ATTRIBUTE_MIN}, max {ATTRIBUTE_MAX})
                  </div>
                </div>
                <div
                  className={`character-creation__status${
                    attributeRemaining === 0 ? " character-creation__status--good" : " character-creation__status--warn"
                  }`}
                >
                  Remaining: {attributeRemaining}
                </div>
              </div>
              {ATTRIBUTE_KEYS.map(renderAttributeRow)}
            </div>

            <div className="character-creation__card character-creation__section">
              <div className="character-creation__section-title caption muted">Skill Adjustments</div>
              <div className="character-creation__skill-list">
                {sortedSkills
                  .map((skill) => ({ skill, bonus: skillBonuses[getSkillCode(skill)] ?? 0 }))
                  .map(({ skill, bonus }) => (
                    <div
                      key={skill.id}
                      className="character-creation__skill-row"
                    >
                      <div className="character-creation__skill-name">{skill.name}</div>
                      <div
                        className={`character-creation__bonus${
                          bonus >= 0 ? " character-creation__bonus--positive" : " character-creation__bonus--negative"
                        } character-creation__skill-bonus`}
                      >
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
        <div className="character-creation__modal-overlay">
          <div className="character-creation__modal">
            <div className="character-creation__modal-header">
              <div>
                <div className="character-creation__muted">Psionic unlocks</div>
                <h3 className="character-creation__modal-title h2">Select Psionic Abilities</h3>
                <p className="character-creation__modal-subtitle subtitle muted">
                  {psionicsModal.characterName} qualifies for additional psionic techniques. Choose the required options now or
                  keep the defaults to pick later.
                </p>
              </div>
            </div>

            {psionicsModal.baseAbilityIds.length > 0 && (
              <div className="character-creation__card character-creation__card--subtle character-creation__modal-auto">
                <strong>Automatically granted:</strong>
                <ul className="character-creation__list">
                  {psionicsModal.baseAbilityIds.map((id) => {
                    const ability = psionicAbilityById.get(id);
                    return (
                      <li key={id} className="character-creation__modal-list-item">
                        {ability ? `${ability.name} (${ability.tree})` : id}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="character-creation__modal-grid">
              {psionicsModal.choices.map((choice, idx) => (
                <div
                  key={`${choice.backgroundName}-${idx}`}
                  className="character-creation__card character-creation__card--subtle"
                >
                  <div className="character-creation__modal-choice-header">
                    <div>
                      <div className="character-creation__muted">Background</div>
                      <div className="character-creation__value">{choice.backgroundName}</div>
                    </div>
                    <div className="character-creation__muted">
                      Choose {choice.selectedIds.length}/{choice.required}
                    </div>
                  </div>
                  <div className="character-creation__modal-options">
                    {choice.options.map((option) => {
                      const ability = psionicAbilityById.get(option.id);
                      const isSelected = choice.selectedIds.includes(option.id);
                      const disableNewSelection = !isSelected && choice.selectedIds.length >= choice.required;
                      return (
                        <label
                          key={option.id}
                          className={`character-creation__option character-creation__option--psionic${
                            isSelected ? " character-creation__option--selected" : ""
                          }`}
                          style={{ cursor: disableNewSelection ? "not-allowed" : "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={disableNewSelection}
                            onChange={() => handleTogglePsionicOption(idx, option.id)}
                            className="character-creation__option-input"
                          />
                          <div>
                            <div className="character-creation__option-title">{ability?.name ?? option.name}</div>
                            <div className="character-creation__muted">{ability?.tree ?? option.tree}</div>
                            {ability?.description && (
                              <div className="character-creation__option-description">
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

            <div className="character-creation__modal-actions">
              <button onClick={closePsionicsModal} className="character-creation__button">
                Decide later
              </button>
              <button
                onClick={persistPsionicChoices}
                disabled={!psionicsModalComplete}
                className="character-creation__button character-creation__button--primary"
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
