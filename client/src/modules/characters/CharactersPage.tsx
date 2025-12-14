import React from "react";
import { useNavigate } from "react-router-dom";
import { api, Character, ApiError, NamedDefinition } from "../../api/client";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";
import { AttributeKey, computeAttributeSkillBonuses, getSkillCode, groupSkillsByCategory } from "./skillMetadata";
import psionicsCsv from "../../data/psionics.csv?raw";
import { parsePsionicsCsv, PsionicAbility, replaceMentalAttributePlaceholders } from "../psionics/psionicsUtils";
import { PSIONICS_STORAGE_KEY } from "../psionics/psionBackgrounds";

const DEFAULT_SKILL_POINT_POOL = 100;

const isAllocationMap = (value: unknown): value is Record<string, number> => {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === "number");
};

const isCharacter = (value: unknown): value is Character => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Character>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.level === "number" &&
    typeof candidate.skillPoints === "number" &&
    isAllocationMap(candidate.skillAllocations)
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
  skillBonuses: Record<string, number>;
  onChangeAllocation: (skillCode: string, delta: number) => void;
  disableAllocation: boolean;
  attributePointsAvailable: number;
  onSpendAttributePoint: (attributeKey: AttributeKey) => void;
  isUpdating: boolean;
  onSaveNotes: (notes: Partial<Character>) => void;
}

const SPECIAL_SKILL_CODES = ["MARTIAL_PROWESS", "ILDAKAR_FACULTY"];
const ATTRIBUTE_DISPLAY: { key: keyof Required<Character>["attributes"] | string; label: string }[] = [
  { key: "PHYSICAL", label: "Physical" },
  { key: "MENTAL", label: "Mental" },
  { key: "SPIRITUAL", label: "Spiritual" },
  { key: "WILL", label: "Will" }
];

const CharacterSheet: React.FC<CharacterSheetProps> = ({
  character,
  skills,
  raceName,
  subraceName,
  remaining,
  skillPointPool,
  allocations,
  skillBonuses,
  onChangeAllocation,
  disableAllocation,
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
  const storageKey = React.useMemo(() => `${PSIONICS_STORAGE_KEY}:${character.id}`, [character.id]);

  const [weaponNotes, setWeaponNotes] = React.useState<string>(character.weaponNotes ?? "");
  const [defenseNotes, setDefenseNotes] = React.useState<string>(character.defenseNotes ?? "");
  const [gearNotes, setGearNotes] = React.useState<string>(character.gearNotes ?? "");

  const summaryBarStyle: React.CSSProperties = {
    background: "#1a1d24",
    border: "1px solid #333",
    borderRadius: 8,
    padding: "0.75rem",
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "0.75rem"
  };

  const cardStyle: React.CSSProperties = {
    background: "#14171d",
    border: "1px solid #2d343f",
    borderRadius: 8,
    padding: "0.75rem",
    color: "#e8edf7",
    boxSizing: "border-box"
  };

  const pillStyle: React.CSSProperties = {
    background: "#0e1116",
    border: "1px solid #2f3642",
    borderRadius: 6,
    padding: "0.5rem 0.75rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#e8edf7",
    fontSize: 14
  };

  const levelCards = Array.from({ length: 5 }, (_, idx) => idx + 1);
  const energyBase = character.raceKey === "ANZ" ? 140 : 100;
  const energyPerLevel = character.raceKey === "ANZ" ? 14 : 10;
  const energy = energyBase + energyPerLevel * (character.level - 1);
  const damageReduction = 0;
  const fatePoints = character.fatePoints ?? 0;
  const attributeValues = character.attributes ?? {};

  React.useEffect(() => {
    setWeaponNotes(character.weaponNotes ?? "");
    setDefenseNotes(character.defenseNotes ?? "");
    setGearNotes(character.gearNotes ?? "");
  }, [character.defenseNotes, character.gearNotes, character.id, character.weaponNotes]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setUnlockedPsionics([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setUnlockedPsionics([]);
        return;
      }
      const parsed = JSON.parse(raw) as { purchased?: string[]; backgroundPicks?: string[] };
      const unlockedIds = new Set([...(parsed.purchased ?? []), ...(parsed.backgroundPicks ?? [])]);
      const unlocked = psionicAbilities.filter((ability) => unlockedIds.has(ability.id));
      setUnlockedPsionics(unlocked);
    } catch (err) {
      console.warn("Unable to read psionics state", err);
      setUnlockedPsionics([]);
    }
  }, [psionicAbilities, storageKey]);

  const renderSkillAllocationRow = (skill: NamedDefinition, showDivider = true) => {
    const code = getSkillCode(skill);
    const allocated = allocations[code] ?? 0;
    const bonus = skillBonuses[code] ?? 0;
    const total = allocated + bonus;
    const disableInc = disableAllocation || remaining <= 0;
    const disableDec = disableAllocation || allocated <= 0;

    return (
      <div
        key={code}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) 150px 80px",
          alignItems: "center",
          gap: "0.45rem",
          padding: "0.4rem 0.25rem",
          borderBottom: showDivider ? "1px solid #161b23" : "none",
          background: "#0c0f14",
          borderRadius: 6
        }}
      >
        <div style={{ wordBreak: "break-word" }}>
          <div style={{ fontWeight: 600 }}>{formatSkillName(skill.name)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => onChangeAllocation(code, -1)} disabled={disableDec} style={{ padding: "0.2rem 0.4rem", minWidth: 28 }}>
            -
          </button>
          <div style={{ width: 28, textAlign: "center" }}>{allocated}</div>
          <button onClick={() => onChangeAllocation(code, 1)} disabled={disableInc} style={{ padding: "0.2rem 0.4rem", minWidth: 28 }}>
            +
          </button>
        </div>
        <div style={{ fontWeight: 700, textAlign: "right" }}>{total}</div>
      </div>
    );
  };

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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, color: "#9aa3b5" }}>{label}</div>
      <textarea
        value={value}
        onChange={(e) => setter(e.target.value)}
        onBlur={() => handleNoteBlur(field, value)}
        rows={8}
        disabled={isUpdating}
        style={{
          width: "100%",
          background: "#0e1116",
          color: "#e8edf7",
          border: "1px solid #2d343f",
          borderRadius: 8,
          padding: "0.6rem 0.7rem",
          resize: "vertical"
        }}
      />
      <div style={{ fontSize: 12, color: "#9aa3b5" }}>Changes are saved on blur.</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={summaryBarStyle}>
        <div style={pillStyle}>
          <span>Name</span>
          <strong>{character.name}</strong>
        </div>
        <div style={pillStyle}>
          <span>Level</span>
          <strong>{character.level}</strong>
        </div>
        <div style={pillStyle}>
          <span>XP</span>
          <strong>—</strong>
        </div>
        <div style={pillStyle}>
          <span>Race</span>
          <strong>{raceName || "Unselected"}</strong>
        </div>
        <div style={pillStyle}>
          <span>Subrace</span>
          <strong>{subraceName || "Unselected"}</strong>
        </div>
        <div style={pillStyle}>
          <span>Speed</span>
          <strong>—</strong>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: "0.65rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#9aa3b5" }}>Attribute Points Available</div>
          <div style={{ fontWeight: 700, color: attributePointsAvailable > 0 ? "#9ae6b4" : "#e8edf7" }}>
            {attributePointsAvailable}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
          {ATTRIBUTE_DISPLAY.map((attr) => (
            <div key={attr.key as string} style={{ ...pillStyle, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span>{attr.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <strong>{attributeValues?.[attr.key as string] ?? 0}</strong>
                <button
                  onClick={() => onSpendAttributePoint(attr.key as AttributeKey)}
                  disabled={attributePointsAvailable <= 0 || isUpdating}
                  style={{ padding: "0.15rem 0.4rem", borderRadius: 4 }}
                >
                  +1
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 960px 1fr", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {levelCards.map((lvl) => (
            <div key={lvl} style={cardStyle}>
              <div style={{ fontSize: 14, color: "#9aa3b5", marginBottom: 4 }}>Level {lvl}</div>
              <div style={{ height: 48, border: "1px dashed #2f3642", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#667" }}>
                Future feat slots
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
            <div style={pillStyle}>
              <span>Damage Reduction</span>
              <strong>{damageReduction}</strong>
            </div>
            <div style={pillStyle}>
              <span>Fate</span>
              <strong>{fatePoints}</strong>
            </div>
            <div style={pillStyle}>
              <span>Energy</span>
              <strong>{energy}</strong>
            </div>
          </div>
          <div style={{ ...cardStyle, padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
            <div
              style={{
                padding: "0.75rem 1rem",
                borderBottom: "1px solid #2d343f",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "#9aa3b5" }}>Skill Points Remaining</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: remaining < 0 ? "#f55" : "#9ae6b4" }}>
                  {remaining}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#9aa3b5" }}>Pool: {skillPointPool}</div>
            </div>
            <div style={{ overflowY: "auto", padding: "0.75rem", flex: 1 }}>
              {skills.length === 0 ? (
                <div style={{ padding: "0.5rem 0.25rem", color: "#9aa3b5" }}>No skills defined yet.</div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "0.75rem"
                  }}
                >
                  {specialSkills.map((skill) => (
                    <div
                      key={getSkillCode(skill)}
                      style={{
                        border: "1px solid #1f242d",
                        borderRadius: 8,
                        padding: "0.5rem 0.6rem",
                        background: "#0e1118",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                      }}
                    >
                      {renderSkillAllocationRow(skill, false)}
                    </div>
                  ))}
                  {groupedSkills.map((group) => (
                    <div
                      key={group.key}
                      style={{
                        border: "1px solid #1f242d",
                        borderRadius: 8,
                        padding: "0.5rem 0.6rem",
                        background: "#0e1118",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#e8edf7" }}>{group.label}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {[...group.skills]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((skill, idx, arr) => renderSkillAllocationRow(skill, idx < arr.length - 1))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {["Weapons", "Defense", "Gear", "Psionics", "Spells", "Details", "Feats", "Actions"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.45rem 0.75rem",
                  borderRadius: 6,
                  border: activeTab === tab ? "1px solid #f38b2f" : "1px solid #2d343f",
                  background: activeTab === tab ? "#1f2a33" : "#14171d",
                  color: "#e8edf7",
                  cursor: "pointer"
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <div style={{ ...cardStyle, minHeight: 240 }}>
            {activeTab === "Weapons" && renderNotesArea("Weapons", weaponNotes, setWeaponNotes, "weaponNotes")}
            {activeTab === "Defense" && renderNotesArea("Defense", defenseNotes, setDefenseNotes, "defenseNotes")}
            {activeTab === "Gear" && renderNotesArea("Gear", gearNotes, setGearNotes, "gearNotes")}
            {activeTab === "Psionics" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                  Unlocked psionic abilities are stored per character. Edit unlocks on the Psionics page; summaries appear here.
                </div>
                {unlockedPsionics.length === 0 ? (
                  <div style={{ color: "#9aa3b5" }}>No psionic abilities unlocked yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {groupedPsionics.map(({ tree, abilities }) => (
                      <div key={tree} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ fontWeight: 700, color: "#e8edf7" }}>{tree}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                          {abilities.map((ability) => (
                            <details key={ability.id} style={{ border: "1px solid #1f242d", borderRadius: 8, padding: "0.5rem 0.6rem" }}>
                              <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 700 }}>{ability.name}</span>
                                <span style={{ fontSize: 12, color: "#9aa3b5" }}>
                                  Tier {ability.tier} • Energy {ability.energyCost}
                                </span>
                              </summary>
                              <div style={{ marginTop: 6, color: "#cfd6e5", fontSize: 13, whiteSpace: "pre-wrap" }}>
                                <div style={{ marginBottom: 4 }}>
                                  {replaceMentalAttributePlaceholders(ability.description, attributeValues?.MENTAL ?? 0)}
                                </div>
                                {ability.formula && (
                                  <div style={{ fontSize: 12, color: "#9aa3b5" }}>
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
              <div style={{ color: "#9aa3b5" }}>This tab is a placeholder for future content.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CharactersPage: React.FC = () => {
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [allocationSavingId, setAllocationSavingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [levelUpdatingId, setLevelUpdatingId] = React.useState<string | null>(null);
  const [generalSavingId, setGeneralSavingId] = React.useState<string | null>(null);

  const { selectedId, setSelectedId } = useSelectedCharacter();
  const navigate = useNavigate();

  const {
    data: definitions,
    loading: definitionsLoading,
    error: definitionsError
  } = useDefinitions();

  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .listCharacters()
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
          navigate("/character-creation");
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

  const onChangeAllocation = async (skillCode: string, delta: number) => {
    if (!selectedId) return;
    const selectedCharacter = characters.find((c) => c.id === selectedId);
    if (!selectedCharacter) return;

    const pool = selectedCharacter.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
    const currentAllocations = selectedCharacter.skillAllocations ?? {};
    const currentValue = currentAllocations[skillCode] ?? 0;
    const nextValue = Math.max(0, currentValue + delta);
    const currentTotal = sumAllocations(currentAllocations);
    const proposedTotal = currentTotal - currentValue + nextValue;
    if (proposedTotal > pool) return;

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

  const selectedCharacter = characters.find((c) => c.id === selectedId) || null;
  const currentAllocations = selectedCharacter?.skillAllocations ?? {};
  const skillPointPool = selectedCharacter?.skillPoints ?? DEFAULT_SKILL_POINT_POOL;
  const totalAllocated = sumAllocations(currentAllocations);
  const remaining = skillPointPool - totalAllocated;
  const skillBonuses = selectedCharacter?.skillBonuses ?? {};
  const attributePointsAvailable = selectedCharacter?.attributePointsAvailable ?? 0;
  const isGeneralSaving = selectedCharacter ? generalSavingId === selectedCharacter.id : false;

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

  const loadingAny = loading || definitionsLoading;

  return (
    <div>
      <h2 style={{ marginBottom: "0.75rem" }}>Characters</h2>
      {(definitionsError || error) && (
        <p style={{ color: "#f55" }}>{definitionsError || error}</p>
      )}
      <main
        style={{
          background: "#0f1117",
          border: "1px solid #2d343f",
          borderRadius: 10,
          padding: "1rem",
          minHeight: 600
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Selected character</div>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            disabled={loadingAny || characters.length === 0}
            style={{ minWidth: 240 }}
          >
            {characters.length === 0 && <option value="">No characters</option>}
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedId && handleDeleteCharacter(selectedId)}
            disabled={!selectedId || deletingId === selectedId || loadingAny}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #4a1d1d",
              background: "#2c1515",
              color: "#f87171",
              fontWeight: 700,
              cursor: !selectedId || deletingId === selectedId || loadingAny ? "not-allowed" : "pointer"
            }}
          >
            {deletingId === selectedId ? "Deleting..." : "Delete Character"}
          </button>
          <button
            onClick={handleLevelUp}
            disabled={!selectedId || loadingAny || levelUpdatingId === selectedId}
            style={{
              padding: "0.45rem 0.75rem",
              borderRadius: 8,
              border: "1px solid #374151",
              background: "#1b2431",
              color: "#e5e7eb",
              fontWeight: 700,
              cursor: !selectedId || loadingAny || levelUpdatingId === selectedId ? "not-allowed" : "pointer"
            }}
          >
            {levelUpdatingId === selectedId ? "Leveling..." : "Level Up"}
          </button>
        </div>
        {loadingAny && <p style={{ margin: 0 }}>Loading sheet...</p>}
        {!loadingAny && !selectedCharacter && <p style={{ margin: 0 }}>Select a character to view the sheet.</p>}
        {!loadingAny && selectedCharacter && definitions && (
          <CharacterSheet
            character={selectedCharacter}
            skills={definitions.skills}
            raceName={raceMap.get(selectedCharacter.raceKey || "")}
            subraceName={subraceMap.get(selectedCharacter.subraceKey || "")?.name}
            remaining={remaining}
            skillPointPool={skillPointPool}
            allocations={currentAllocations}
            skillBonuses={skillBonuses}
            onChangeAllocation={onChangeAllocation}
            disableAllocation={loadingAny || allocationSavingId === selectedCharacter.id}
            attributePointsAvailable={attributePointsAvailable}
            onSpendAttributePoint={handleSpendAttributePoint}
            isUpdating={loadingAny || isGeneralSaving}
            onSaveNotes={handleSaveNotes}
          />
        )}
      </main>
    </div>
  );
};
