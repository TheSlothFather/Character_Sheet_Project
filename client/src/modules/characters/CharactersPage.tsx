import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Character, ApiError, NamedDefinition } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";
import { AttributeKey, computeAttributeSkillBonuses, getSkillCode, groupSkillsByCategory } from "./skillMetadata";
import psionicsCsv from "../../data/psionics.csv?raw";
import { parsePsionicsCsv, PsionicAbility, replaceMentalAttributePlaceholders } from "../psionics/psionicsUtils";
import { PSIONICS_STORAGE_KEY } from "../psionics/psionBackgrounds";
import { getAncillaryStorageKey, readAncillarySelection } from "../ancillaries/storage";
import "./CharactersPage.css";

const DEFAULT_SKILL_POINT_POOL = 100;
const ENERGY_OVERRIDE_ANCILLARIES = new Set([
  "advanced-psion",
  "heroic-psion",
  "epic-psion",
  "legendary-psion",
  "mythic-psion"
]);

const isAllocationMap = (value: unknown): value is Record<string, number> => {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "number");
};

const isOptionalAllocationMap = (value: unknown): value is Record<string, number> | undefined =>
  value === undefined || isAllocationMap(value);

const isCharacter = (value: unknown): value is Character => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Character>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.level === "number" &&
    typeof candidate.skillPoints === "number" &&
    isAllocationMap(candidate.skillAllocations) &&
    isOptionalAllocationMap(candidate.skillAllocationMinimums)
  );
};

const isCharacterArray = (value: unknown): value is Character[] =>
  Array.isArray(value) && value.every(isCharacter);

const sumAllocations = (allocations: Record<string, number>): number =>
  Object.values(allocations).reduce((acc, v) => acc + v, 0);

const formatSkillName = (rawName: string): string =>
  rawName
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b(\w)/g, (match) => match.toUpperCase());

const ATTRIBUTE_KEYS: AttributeKey[] = ["PHYSICAL", "MENTAL", "SPIRITUAL", "WILL"];

const normalizeAttributes = (attributes: Record<string, number> | undefined): Record<AttributeKey, number> => {
  const normalized: Record<AttributeKey, number> = {
    PHYSICAL: 0,
    MENTAL: 0,
    SPIRITUAL: 0,
    WILL: 0
  };
  ATTRIBUTE_KEYS.forEach((key) => {
    if (typeof attributes?.[key] === "number") {
      normalized[key] = attributes[key] as number;
    }
  });
  return normalized;
};

const mergeAttributeSkillBonuses = (
  currentBonuses: Record<string, number> | undefined,
  previousAttributes: Record<AttributeKey, number>,
  nextAttributes: Record<AttributeKey, number>,
  skills: NamedDefinition[] | undefined
): Record<string, number> => {
  const prevAttributeBonuses = computeAttributeSkillBonuses(previousAttributes, skills);
  const nextAttributeBonuses = computeAttributeSkillBonuses(nextAttributes, skills);
  const merged: Record<string, number> = { ...(currentBonuses ?? {}) };

  const affectedSkills = new Set([...Object.keys(prevAttributeBonuses), ...Object.keys(nextAttributeBonuses)]);
  affectedSkills.forEach((code) => {
    const priorBonus = prevAttributeBonuses[code] ?? 0;
    const otherBonus = (merged[code] ?? 0) - priorBonus;
    merged[code] = otherBonus + (nextAttributeBonuses[code] ?? 0);
  });

  return merged;
};

interface CharacterSheetProps {
  character: Character;
  skills: NamedDefinition[];
  raceName?: string;
  subraceName?: string;
  remaining: number;
  skillPointPool: number;
  allocations: Record<string, number>;
  allocationMinimums: Record<string, number>;
  skillBonuses: Record<string, number>;
  onChangeAllocation: (skillCode: string, value: number) => void;
  onLockAllocations: () => void;
  disableAllocation: boolean;
  lockDisabled: boolean;
  isLocking: boolean;
  attributePointsAvailable: number;
  onSpendAttributePoint: (attributeKey: AttributeKey) => void;
  isUpdating: boolean;
  onSaveNotes: (notes: Partial<Character>) => void;
}

const SPECIAL_SKILL_CODES = ["MARTIAL_PROWESS", "ILDAKAR_FACULTY"];
const MARTIAL_AP_BONUS: Record<string, { ap: number; note: string }> = {
  "fledgling-martial": { ap: 2, note: "Attacks & reactions" },
  "advanced-martial": { ap: 2, note: "Movement, attacks, reactions" },
  "heroic-martial": { ap: 2, note: "Movement, attacks, reactions" },
  "epic-martial": { ap: 3, note: "Movement, attacks, reactions" },
  "legendary-martial": { ap: 3, note: "Movement, attacks, reactions" },
  "mythic-martial": { ap: 3, note: "Movement, attacks, reactions" }
};
const ATTRIBUTE_DISPLAY: { key: keyof Required<Character>["attributes"] | string; label: string }[] = [
  { key: "PHYSICAL", label: "Physical" },
  { key: "MENTAL", label: "Mental" },
  { key: "SPIRITUAL", label: "Spiritual" },
  { key: "WILL", label: "Will" }
];

interface SkillAllocationRowProps {
  skill: NamedDefinition;
  showDivider?: boolean;
  allocations: Record<string, number>;
  allocationMinimums: Record<string, number>;
  skillBonuses: Record<string, number>;
  remaining: number;
  disableAllocation: boolean;
  onChangeAllocation: (skillCode: string, value: number) => void;
}

const SkillAllocationRow: React.FC<SkillAllocationRowProps> = ({
  skill,
  showDivider = true,
  allocations,
  allocationMinimums,
  skillBonuses,
  remaining,
  disableAllocation,
  onChangeAllocation
}) => {
  const code = getSkillCode(skill);
  const allocated = allocations[code] ?? 0;
  const minimum = allocationMinimums[code] ?? 0;
  const bonus = skillBonuses[code] ?? 0;
  const total = allocated + bonus;
  const maxAllocatable = Math.max(minimum, allocated + Math.max(remaining, 0));

  const allocationRef = React.useRef<number>(allocated);
  React.useEffect(() => {
    allocationRef.current = allocations[code] ?? 0;
  }, [allocations, code]);

  const [inputValue, setInputValue] = React.useState<string>(String(allocated));

  React.useEffect(() => {
    setInputValue(String(allocations[code] ?? 0));
  }, [allocations, code]);

  const repeatTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const repeatIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const stopRepeating = React.useCallback(() => {
    if (repeatTimeoutRef.current) {
      clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  React.useEffect(() => stopRepeating, [stopRepeating]);

  const handleSpinChange = (value: number) => {
    if (!Number.isFinite(value)) return;
    const sanitized = Math.floor(value);
    const clamped = Math.min(Math.max(sanitized, minimum), maxAllocatable);
    setInputValue(String(clamped));
    onChangeAllocation(code, clamped);
  };

  const applyDelta = (delta: number) => {
    const current = allocationRef.current ?? 0;
    handleSpinChange(current + delta);
  };

  const startRepeating = (delta: number) => {
    if (disableAllocation) return;
    stopRepeating();
    applyDelta(delta);
    repeatTimeoutRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => applyDelta(delta), 125);
    }, 350);
  };

  return (
    <div
      className={`characters__skill-row${showDivider ? " characters__skill-row--divider" : ""}`}
    >
      <div className="characters__skill-name">
        <div className="characters__skill-name-text">{formatSkillName(skill.name)}</div>
      </div>
      <div className="characters__skill-controls">
        <button
          type="button"
          onPointerDown={() => startRepeating(-1)}
          onPointerUp={stopRepeating}
          onPointerLeave={stopRepeating}
          onPointerCancel={stopRepeating}
          disabled={disableAllocation || allocated <= minimum}
          className="btn characters__skill-button"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          disabled={disableAllocation}
          onChange={(e) => {
            const next = e.target.value;
            setInputValue(next);
            if (next.trim() === "" || next === "-") return;
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed)) handleSpinChange(parsed);
          }}
          onBlur={() => setInputValue(String(allocations[code] ?? 0))}
          onWheel={(e) => {
            e.preventDefault();
            e.currentTarget.blur();
          }}
          onMouseUp={(e) => e.currentTarget.blur()}
          className="input characters__skill-input"
        />
        <button
          type="button"
          onPointerDown={() => startRepeating(1)}
          onPointerUp={stopRepeating}
          onPointerLeave={stopRepeating}
          onPointerCancel={stopRepeating}
          disabled={disableAllocation || allocated >= maxAllocatable}
          className="btn characters__skill-button"
        >
          +
        </button>
      </div>
      <div className="characters__skill-total">{total}</div>
    </div>
  );
};

const CharacterSheet: React.FC<CharacterSheetProps> = ({
  character,
  skills,
  raceName,
  subraceName,
  remaining,
  skillPointPool,
  allocations,
  allocationMinimums,
  skillBonuses,
  onChangeAllocation,
  onLockAllocations,
  disableAllocation,
  lockDisabled,
  isLocking,
  attributePointsAvailable,
  onSpendAttributePoint,
  isUpdating,
  onSaveNotes
}) => {
  const [activeTab, setActiveTab] = React.useState<string>("Weapons");
  const regularSkills = React.useMemo(
    () => skills.filter((skill) => !SPECIAL_SKILL_CODES.includes(getSkillCode(skill).toUpperCase())),
    [skills]
  );
  const groupedSkills = React.useMemo(() => groupSkillsByCategory(regularSkills), [regularSkills]);
  const specialSkills = React.useMemo(
    () =>
      SPECIAL_SKILL_CODES.map((code) => {
        const match = skills.find((skill) => getSkillCode(skill).toUpperCase() === code);
        if (match) return match;
        return { id: code, name: formatSkillName(code) } as NamedDefinition;
      }),
    [skills]
  );

  const psionicAbilities = React.useMemo<PsionicAbility[]>(() => parsePsionicsCsv(psionicsCsv), []);
  const [unlockedPsionics, setUnlockedPsionics] = React.useState<PsionicAbility[]>([]);
  const [psionicEnergyOverrides, setPsionicEnergyOverrides] = React.useState<Map<string, number>>(new Map());
  const storageKey = React.useMemo(() => `${PSIONICS_STORAGE_KEY}:${character.id}`, [character.id]);

  const [weaponNotes, setWeaponNotes] = React.useState<string>(character.weaponNotes ?? "");
  const [defenseNotes, setDefenseNotes] = React.useState<string>(character.defenseNotes ?? "");
  const [gearNotes, setGearNotes] = React.useState<string>(character.gearNotes ?? "");
  const [ancillarySelection, setAncillarySelection] = React.useState(() => readAncillarySelection(character.id));

  React.useEffect(() => {
    setAncillarySelection(readAncillarySelection(character.id));
    const storageKey = getAncillaryStorageKey(character.id);

    const handler = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setAncillarySelection(readAncillarySelection(character.id));
      }
    };

    if (typeof window !== "undefined") window.addEventListener("storage", handler);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("storage", handler);
    };
  }, [character.id]);

  const levelCards = Array.from({ length: 5 }, (_, idx) => idx + 1);
  const energyBase = character.raceKey === "ANZ" ? 140 : 100;
  const energyPerLevel = character.raceKey === "ANZ" ? 14 : 10;
  const energeticMultiplier = ancillarySelection.selected.includes("energetic")
    ? 1 + 0.1 * character.level
    : 1;
  const energy = Math.round((energyBase + energyPerLevel * (character.level - 1)) * energeticMultiplier);
  const damageReduction = 0;
  const fatePoints = character.fatePoints ?? 0;
  const attributeValues = character.attributes ?? {};

  const martialBonus = React.useMemo(() => {
    return ancillarySelection.selected.reduce(
      (acc, id) => {
        const bonus = MARTIAL_AP_BONUS[id];
        if (!bonus) return acc;
        return { ap: acc.ap + bonus.ap, notes: new Set([...acc.notes, bonus.note]) };
      },
      { ap: 0, notes: new Set<string>() }
    );
  }, [ancillarySelection.selected]);

  React.useEffect(() => {
    setWeaponNotes(character.weaponNotes ?? "");
    setDefenseNotes(character.defenseNotes ?? "");
    setGearNotes(character.gearNotes ?? "");
  }, [character.defenseNotes, character.gearNotes, character.id, character.weaponNotes]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setUnlockedPsionics([]);
      setPsionicEnergyOverrides(new Map());
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setUnlockedPsionics([]);
        setPsionicEnergyOverrides(new Map());
        return;
      }
      const parsed = JSON.parse(raw) as { purchased?: string[]; backgroundPicks?: string[]; ancillaryPicks?: Record<string, string[]> };
      const ancillaryPicks = parsed.ancillaryPicks ?? {};
      const ancillaryIds = Object.values(ancillaryPicks).flat();
      const unlockedIds = new Set([...(parsed.purchased ?? []), ...(parsed.backgroundPicks ?? []), ...ancillaryIds]);
      const unlocked = psionicAbilities.filter((ability) => unlockedIds.has(ability.id));
      const overrides = new Map<string, number>();
      Object.entries(ancillaryPicks).forEach(([ancillaryId, abilityIds]) => {
        if (!ENERGY_OVERRIDE_ANCILLARIES.has(ancillaryId)) return;
        abilityIds.forEach((abilityId) => overrides.set(abilityId, 1));
      });
      setUnlockedPsionics(unlocked);
      setPsionicEnergyOverrides(overrides);
    } catch (err) {
      console.warn("Unable to read psionics state", err);
      setUnlockedPsionics([]);
      setPsionicEnergyOverrides(new Map());
    }
  }, [psionicAbilities, storageKey]);

  const groupedPsionics = React.useMemo(() => {
    const groups = new Map<string, PsionicAbility[]>();
    unlockedPsionics.forEach((ability) => {
      const list = groups.get(ability.tree) ?? [];
      list.push(ability);
      groups.set(ability.tree, list);
    });

    return Array.from(groups.entries()).map(([tree, abilitiesForTree]) => ({
      tree,
      abilities: abilitiesForTree.sort((a, b) => {
        if (a.tier === b.tier) return a.name.localeCompare(b.name);
        return a.tier - b.tier;
      })
    }));
  }, [unlockedPsionics]);

  const handleNoteBlur = (field: "weaponNotes" | "defenseNotes" | "gearNotes", value: string) => {
    const currentValue = character[field] ?? "";
    if (currentValue === value) return;
    onSaveNotes({ [field]: value });
  };

  const renderNotesArea = (
    label: string,
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    field: "weaponNotes" | "defenseNotes" | "gearNotes"
  ) => (
    <div className="stack characters__notes">
      <div className="characters__notes-label">{label}</div>
      <textarea
        value={value}
        onChange={(e) => setter(e.target.value)}
        onBlur={() => handleNoteBlur(field, value)}
        rows={8}
        disabled={isUpdating}
        className="textarea characters__notes-textarea"
      />
      <div className="characters__notes-hint">Changes are saved on blur.</div>
    </div>
  );

  return (
    <div className="stack characters__sheet">
      <div className="panel grid characters__summary">
        <div className="characters__pill">
          <span>Name</span>
          <strong>{character.name}</strong>
        </div>
        <div className="characters__pill">
          <span>Level</span>
          <strong>{character.level}</strong>
        </div>
        <div className="characters__pill">
          <span>XP</span>
          <strong>—</strong>
        </div>
        <div className="characters__pill">
          <span>Race</span>
          <strong>{raceName || "Unselected"}</strong>
        </div>
        <div className="characters__pill">
          <span>Subrace</span>
          <strong>{subraceName || "Unselected"}</strong>
        </div>
        <div className="characters__pill">
          <span>Speed</span>
          <strong>—</strong>
        </div>
      </div>

      <div className="card stack characters__attributes">
        <div className="characters__attributes-header">
          <div className="characters__attributes-label">Attribute Points Available</div>
          <div
            className={`characters__attributes-value${
              attributePointsAvailable > 0 ? " characters__attributes-value--available" : ""
            }`}
          >
            {attributePointsAvailable}
          </div>
        </div>
        <div className="characters__attributes-grid">
          {ATTRIBUTE_DISPLAY.map((attr) => (
            <div key={attr.key as string} className="characters__pill characters__pill--compact">
              <span>{attr.label}</span>
              <div className="characters__pill-actions">
                <strong>{attributeValues?.[attr.key as string] ?? 0}</strong>
                <button
                  onClick={() => onSpendAttributePoint(attr.key as AttributeKey)}
                  disabled={attributePointsAvailable <= 0 || isUpdating}
                  className="btn characters__pill-button"
                >
                  +1
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid characters__layout">
        <div className="stack characters__column">
          {levelCards.map((lvl) => (
            <div key={lvl} className="card">
              <div className="characters__level-label">Level {lvl}</div>
              <div className="characters__level-slot">
                Future feat slots
              </div>
            </div>
          ))}
        </div>

        <div className="stack characters__column">
          <div className="grid characters__metrics">
            <div className="characters__pill">
              <span>Damage Reduction</span>
              <strong>{damageReduction}</strong>
            </div>
            <div className="characters__pill">
              <span>Fate</span>
              <strong>{fatePoints}</strong>
            </div>
            <div className="characters__pill">
              <span>Energy</span>
              <strong>{energy}</strong>
            </div>
            <div className="characters__pill characters__pill--stacked">
              <div className="characters__pill-stack-header">
                <span>Martial Bonus AP</span>
                <strong>{martialBonus.ap}</strong>
              </div>
              {martialBonus.notes.size > 0 && (
                <div className="characters__pill-hint">
                  {Array.from(martialBonus.notes).join(", ")}
                </div>
              )}
            </div>
          </div>
          <div className="card characters__card--flush">
            <div className="characters__skill-header">
              <div>
                <div className="characters__skill-label">Skill Points Remaining</div>
                <div className={`characters__skill-remaining${remaining < 0 ? " characters__skill-remaining--over" : ""}`}>
                  {remaining}
                </div>
              </div>
              <div className="characters__skill-actions">
                <div className="characters__skill-pool">Pool: {skillPointPool}</div>
                <button
                  onClick={onLockAllocations}
                  disabled={lockDisabled || isLocking}
                  className="btn btn--secondary characters__lock-button"
                >
                  {isLocking ? "Locking..." : "Lock Skill Points"}
                </button>
              </div>
            </div>
            <div className="characters__skill-warning">
              Spend all skill points at level up and lock your allocations when finished.
            </div>
            <div className="characters__skill-list">
              {skills.length === 0 ? (
                <div className="characters__skill-empty">No skills defined yet.</div>
              ) : (
                <div className="grid characters__skill-grid">
                  {specialSkills.map((skill) => (
                    <div
                      key={getSkillCode(skill)}
                      className="characters__skill-card"
                    >
                      <SkillAllocationRow
                        skill={skill}
                        showDivider={false}
                        allocations={allocations}
                        allocationMinimums={allocationMinimums}
                        skillBonuses={skillBonuses}
                        remaining={remaining}
                        disableAllocation={disableAllocation}
                        onChangeAllocation={onChangeAllocation}
                      />
                    </div>
                  ))}
                  {groupedSkills.map((group) => (
                    <div
                      key={group.key}
                      className="characters__skill-card"
                    >
                      <div className="characters__skill-group-title">{group.label}</div>
                      <div className="characters__skill-group-list">
                          {[...group.skills]
                            .sort((a, b) => a.name.localeCompare(b.name))
                          .map((skill, idx, arr) => (
                            <SkillAllocationRow
                              key={getSkillCode(skill)}
                              skill={skill}
                              showDivider={idx < arr.length - 1}
                              allocations={allocations}
                              allocationMinimums={allocationMinimums}
                              skillBonuses={skillBonuses}
                              remaining={remaining}
                              disableAllocation={disableAllocation}
                              onChangeAllocation={onChangeAllocation}
                            />
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="stack characters__column">
          <div className="characters__tabs">
            {["Weapons", "Defense", "Gear", "Psionics", "Spells", "Details", "Feats", "Actions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`btn characters__tab${activeTab === tab ? " characters__tab--active" : ""}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="card characters__tab-panel">
            {activeTab === "Weapons" && renderNotesArea("Weapons", weaponNotes, setWeaponNotes, "weaponNotes")}
            {activeTab === "Defense" && renderNotesArea("Defense", defenseNotes, setDefenseNotes, "defenseNotes")}
            {activeTab === "Gear" && renderNotesArea("Gear", gearNotes, setGearNotes, "gearNotes")}
            {activeTab === "Psionics" && (
              <div className="stack characters__psionics">
                <div className="characters__psionics-hint">
                  Unlocked psionic abilities are stored per character. Edit unlocks on the Psionics page; summaries appear here.
                </div>
                {unlockedPsionics.length === 0 ? (
                  <div className="characters__psionics-empty">No psionic abilities unlocked yet.</div>
                ) : (
                  <div className="stack characters__psionics-list">
                    {groupedPsionics.map(({ tree, abilities }) => (
                      <div key={tree} className="stack characters__psionics-tree">
                        <div className="characters__psionics-tree-title">{tree}</div>
                        <div className="grid characters__psionics-grid">
                          {abilities.map((ability) => (
                            <details key={ability.id} className="characters__psionics-detail">
                              <summary className="characters__psionics-summary">
                                <span className="characters__psionics-name">{ability.name}</span>
                                <span className="characters__psionics-meta">
                                  {`Tier ${ability.tier} • Energy ${psionicEnergyOverrides.get(ability.id) ?? ability.energyCost}`}
                                </span>
                              </summary>
                              <div className="characters__psionics-description">
                                <div className="characters__psionics-text">
                                  {replaceMentalAttributePlaceholders(ability.description, attributeValues?.MENTAL ?? 0)}
                                </div>
                                {ability.formula && (
                                  <div className="characters__psionics-formula">
                                    Formula: {replaceMentalAttributePlaceholders(ability.formula, attributeValues?.MENTAL ?? 0)}
                                  </div>
                                )}
                              </div>
                            </details>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!["Weapons", "Defense", "Gear", "Psionics"].includes(activeTab) && (
              <div className="characters__tab-placeholder">This tab is a placeholder for future content.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

type CharactersPageProps = {
  campaignId?: string;
};

export const CharactersPage: React.FC<CharactersPageProps> = ({ campaignId }) => {
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [allocationSavingId, setAllocationSavingId] = React.useState<string | null>(null);
  const [lockingAllocationId, setLockingAllocationId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [levelUpdatingId, setLevelUpdatingId] = React.useState<string | null>(null);
  const [generalSavingId, setGeneralSavingId] = React.useState<string | null>(null);

  const { selectedId, setSelectedId } = useSelectedCharacter();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || undefined;
  const activeCampaignId = campaignId ?? campaignIdFromQuery;

  const createCharacterPath = activeCampaignId
    ? `/player/character-creation?campaignId=${activeCampaignId}`
    : "/player/character-creation";

  const {
    data: definitions,
    loading: definitionsLoading,
    error: definitionsError
  } = useDefinitions();

  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadCharacters = activeCampaignId ? api.listCampaignCharacters(activeCampaignId) : api.listCharacters();
    loadCharacters
      .then((data) => {
        if (!isMounted) return;
        if (!isCharacterArray(data)) {
          throw new Error("Unexpected response when loading characters");
        }
        setCharacters(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setError(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!characters.length) {
      if (!loading && selectedId) setSelectedId(null);
      return;
    }

    if (!selectedId || !characters.some((c) => c.id === selectedId)) {
      setSelectedId(characters[0].id);
    }
  }, [characters, loading, selectedId, setSelectedId]);

  const handleDeleteCharacter = async (id: string) => {
    const character = characters.find((c) => c.id === id);
    if (!character) return;
    if (!window.confirm(`Delete ${character.name}? This cannot be undone.`)) return;

    setError(null);
    setDeletingId(id);
    try {
      await api.deleteCharacter(id);
      setCharacters((prev) => {
        const next = prev.filter((c) => c.id !== id);
        const nextSelected = selectedId === id ? next[0]?.id ?? null : selectedId;
        setSelectedId(nextSelected ?? null);
        if (!nextSelected) {
          navigate(createCharacterPath);
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete character";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const updateSelectedCharacter = async (patch: Partial<Character>, errorMessage = "Failed to update character") => {
    if (!selectedId) return;
    const existing = characters.find((c) => c.id === selectedId);
    if (!existing) return;

    setError(null);
    setGeneralSavingId(selectedId);
    setCharacters((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));

    try {
      const saved = await api.updateCharacter(selectedId, patch);
      if (!isCharacter(saved)) {
        throw new Error("Unexpected response when saving character changes");
      }
      setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : errorMessage;
      setError(message);
      setCharacters((prev) => prev.map((c) => (c.id === selectedId ? existing : c)));
    } finally {
      setGeneralSavingId(null);
    }
  };

  const onChangeAllocation = async (skillCode: string, desiredValue: number) => {
    if (!selectedId) return;
    const selectedCharacter = characters.find((c) => c.id === selectedId);
    if (!selectedCharacter) return;

    const pool = selectedCharacter.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
    const currentAllocations = selectedCharacter.skillAllocations ?? {};
    const minimums = selectedCharacter.skillAllocationMinimums ?? {};
    const currentValue = currentAllocations[skillCode] ?? 0;
    const floor = minimums[skillCode] ?? 0;
    const sanitizedDesired = Number.isFinite(desiredValue) ? Math.floor(desiredValue) : 0;
    const desired = Math.max(floor, sanitizedDesired);
    const available = pool - sumAllocations(currentAllocations) + currentValue;
    const nextValue = Math.min(desired, Math.max(floor, available));
    if (nextValue === currentValue) return;

    const nextAllocations = {
      ...currentAllocations,
      [skillCode]: nextValue
    };

    const optimistic = { ...selectedCharacter, skillAllocations: nextAllocations };
    setCharacters((prev) => prev.map((c) => (c.id === selectedId ? optimistic : c)));
    setAllocationSavingId(selectedId);
    try {
      const saved = await api.updateCharacter(selectedId, { skillAllocations: nextAllocations });
      if (!isCharacter(saved)) {
        throw new Error("Unexpected response when saving allocations");
      }
      setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to save skill allocation";
      setError(message);
      setCharacters((prev) => prev.map((c) => (c.id === selectedId ? selectedCharacter : c)));
    } finally {
      setAllocationSavingId(null);
    }
  };

  const handleLevelUp = async () => {
    if (!selectedId) return;
    const selectedCharacter = characters.find((c) => c.id === selectedId);
    if (!selectedCharacter) return;

    const remainingPoints =
      (selectedCharacter.skillPoints ?? DEFAULT_SKILL_POINT_POOL) -
      sumAllocations(selectedCharacter.skillAllocations ?? {});
    if (remainingPoints > 0) {
      setError("Spend all skill points before leveling up.");
      return;
    }

    const nextLevel = selectedCharacter.level + 1;
    const nextSkillPoints = (selectedCharacter.skillPoints ?? DEFAULT_SKILL_POINT_POOL) + 10;
    const tierAdvancement = nextLevel > 1 && (nextLevel - 1) % 5 === 0;
    const nextAttributePoints = (selectedCharacter.attributePointsAvailable ?? 0) + (tierAdvancement ? 1 : 0);
    const optimistic = {
      ...selectedCharacter,
      level: nextLevel,
      skillPoints: nextSkillPoints,
      attributePointsAvailable: nextAttributePoints
    };

    setError(null);
    setLevelUpdatingId(selectedId);
    setCharacters((prev) => prev.map((c) => (c.id === selectedId ? optimistic : c)));

    try {
      const saved = await api.updateCharacter(selectedId, {
        level: nextLevel,
        skillPoints: nextSkillPoints,
        attributePointsAvailable: nextAttributePoints
      });
      if (!isCharacter(saved)) {
        throw new Error("Unexpected response when updating level");
      }
      setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to level up";
      setError(message);
      setCharacters((prev) => prev.map((c) => (c.id === selectedId ? selectedCharacter : c)));
    } finally {
      setLevelUpdatingId(null);
    }
  };

  const handleSpendAttributePoint = async (attributeKey: AttributeKey) => {
    if (!selectedId) return;
    const selectedCharacter = characters.find((c) => c.id === selectedId);
    if (!selectedCharacter) return;

    const available = selectedCharacter.attributePointsAvailable ?? 0;
    if (available <= 0) return;

    const previousAttributes = normalizeAttributes(selectedCharacter.attributes);
    const nextAttributes = { ...previousAttributes, [attributeKey]: previousAttributes[attributeKey] + 1 };
    const updatedAttributes = { ...(selectedCharacter.attributes ?? {}), [attributeKey]: nextAttributes[attributeKey] };

    const patch: Partial<Character> = {
      attributes: updatedAttributes,
      attributePointsAvailable: available - 1
    };

    if (definitions?.skills) {
      patch.skillBonuses = mergeAttributeSkillBonuses(
        selectedCharacter.skillBonuses,
        previousAttributes,
        nextAttributes,
        definitions.skills
      );
    }

    await updateSelectedCharacter(patch, "Failed to spend attribute point");
  };

  const handleLockAllocations = async () => {
    if (!selectedId) return;
    const selectedCharacter = characters.find((c) => c.id === selectedId);
    if (!selectedCharacter) return;

    const pool = selectedCharacter.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
    const currentAllocations = selectedCharacter.skillAllocations ?? {};
    const remainingPoints = pool - sumAllocations(currentAllocations);
    if (remainingPoints !== 0) {
      setError("Spend all skill points before locking allocations.");
      return;
    }

    const existingMinimums = selectedCharacter.skillAllocationMinimums ?? {};
    const nextMinimums: Record<string, number> = { ...existingMinimums };
    Object.entries(currentAllocations).forEach(([code, value]) => {
      nextMinimums[code] = Math.max(existingMinimums[code] ?? 0, value);
    });

    setError(null);
    setLockingAllocationId(selectedId);
    const optimistic = { ...selectedCharacter, skillAllocationMinimums: nextMinimums };
    setCharacters((prev) => prev.map((c) => (c.id === selectedId ? optimistic : c)));
    try {
      const saved = await api.updateCharacter(selectedId, { skillAllocationMinimums: nextMinimums });
      if (!isCharacter(saved)) {
        throw new Error("Unexpected response when locking skill allocations");
      }
      setCharacters((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to lock skill allocations";
      setError(message);
      setCharacters((prev) => prev.map((c) => (c.id === selectedId ? selectedCharacter : c)));
    } finally {
      setLockingAllocationId(null);
    }
  };

  const selectedCharacter = characters.find((c) => c.id === selectedId) || null;
  const currentAllocations = selectedCharacter?.skillAllocations ?? {};
  const allocationMinimums = selectedCharacter?.skillAllocationMinimums ?? {};
  const skillPointPool = selectedCharacter?.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
  const totalAllocated = sumAllocations(currentAllocations);
  const remaining = skillPointPool - totalAllocated;
  const skillBonuses = selectedCharacter?.skillBonuses ?? {};
  const attributePointsAvailable = selectedCharacter?.attributePointsAvailable ?? 0;
  const isGeneralSaving = selectedCharacter ? generalSavingId === selectedCharacter.id : false;
  const loadingAny = loading || definitionsLoading;
  const lockButtonDisabled =
    !selectedCharacter ||
    loadingAny ||
    allocationSavingId === selectedCharacter?.id ||
    lockingAllocationId === selectedCharacter?.id ||
    remaining !== 0;

  const handleSaveNotes = (notes: Partial<Character>) => updateSelectedCharacter(notes, "Failed to save notes");

  const raceMap = React.useMemo(() => {
    const map = new Map<string, string>();
    (definitions?.races ?? []).forEach((r) => map.set(r.id, r.name));
    return map;
  }, [definitions]);

  const subraceMap = React.useMemo(() => {
    const map = new Map<string, { name: string; parentId?: string }>();
    (definitions?.subraces ?? []).forEach((s) => map.set(s.id, { name: s.name, parentId: s.parentId }));
    return map;
  }, [definitions]);

  return (
    <div className="page characters-page">
      <header className="page__header characters-page__header">
        <h2 className="characters-page__title">Characters</h2>
        {(definitionsError || error) && (
          <p className="characters-page__error">{definitionsError || error}</p>
        )}
      </header>
      <main className="page__content">
        <div className="panel stack characters-page__main">
          <div className="cluster characters-page__toolbar">
            <div className="characters-page__toolbar-label">Selected character</div>
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              disabled={loadingAny || characters.length === 0}
              className="select characters-page__select"
            >
              {characters.length === 0 && <option value="">No characters</option>}
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => navigate(createCharacterPath)}
              className="btn btn--primary"
            >
              New Character
            </button>
            <button
              onClick={() => selectedId && handleDeleteCharacter(selectedId)}
              disabled={!selectedId || deletingId === selectedId || loadingAny}
              className="btn btn--danger"
            >
              {deletingId === selectedId ? "Deleting..." : "Delete Character"}
            </button>
            <button
              onClick={handleLevelUp}
              disabled={!selectedId || loadingAny || levelUpdatingId === selectedId || remaining > 0}
              className="btn btn--secondary"
            >
              {levelUpdatingId === selectedId ? "Leveling..." : "Level Up"}
            </button>
          </div>
          {loadingAny && <p className="characters-page__status">Loading sheet...</p>}
          {!loadingAny && !selectedCharacter && <p className="characters-page__status">Select a character to view the sheet.</p>}
          {!loadingAny && selectedCharacter && definitions && (
            <CharacterSheet
              character={selectedCharacter}
              skills={definitions.skills}
              raceName={raceMap.get(selectedCharacter.raceKey || "")}
              subraceName={subraceMap.get(selectedCharacter.subraceKey || "")?.name}
              remaining={remaining}
              skillPointPool={skillPointPool}
              allocations={currentAllocations}
              allocationMinimums={allocationMinimums}
              skillBonuses={skillBonuses}
              onChangeAllocation={onChangeAllocation}
              onLockAllocations={handleLockAllocations}
              disableAllocation={
                loadingAny || allocationSavingId === selectedCharacter.id || lockingAllocationId === selectedCharacter.id
              }
              lockDisabled={lockButtonDisabled}
              isLocking={lockingAllocationId === selectedCharacter.id}
              attributePointsAvailable={attributePointsAvailable}
              onSpendAttributePoint={handleSpendAttributePoint}
              isUpdating={loadingAny || isGeneralSaving}
              onSaveNotes={handleSaveNotes}
            />
          )}
        </div>
      </main>
    </div>
  );
};
