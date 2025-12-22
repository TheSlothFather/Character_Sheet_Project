import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, Character, ApiError, NamedDefinition } from "../../api/client";
import { getSupabaseClient } from "../../api/supabaseClient";
import { useDefinitions } from "../definitions/DefinitionsContext";
import { useSelectedCharacter } from "./SelectedCharacterContext";
import { AttributeKey, computeAttributeSkillBonuses, getSkillCode, groupSkillsByCategory } from "./skillMetadata";
import psionicsCsv from "../../data/psionics.csv?raw";
import { parsePsionicsCsv, PsionicAbility, replaceMentalAttributePlaceholders } from "../psionics/psionicsUtils";
import { PSIONICS_STORAGE_KEY } from "../psionics/psionBackgrounds";
import { getAncillaryStorageKey, readAncillarySelection } from "../ancillaries/storage";

// New UI Components
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Panel,
  Select,
  Textarea,
  Field,
  SpinButton,
  StatBlock,
  StatRow,
  AttributePill,
  Badge,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Stack,
  Cluster,
  Grid,
  ConfirmDialog,
} from "../../components/ui";

import "./CharactersPage.css";

// ============================================================================
// CONSTANTS & TYPE GUARDS
// ============================================================================

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

// ============================================================================
// TYPES
// ============================================================================

type ArmorOption = {
  id: number;
  name: string;
  armorType?: string | null;
  damageReduction: number;
};

type WeaponCategoryOption = {
  category: string;
  damage?: string | null;
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

const ATTRIBUTE_DISPLAY: { key: AttributeKey; label: string }[] = [
  { key: "PHYSICAL", label: "Physical" },
  { key: "MENTAL", label: "Mental" },
  { key: "SPIRITUAL", label: "Spiritual" },
  { key: "WILL", label: "Will" }
];

const parseDamageValue = (raw: string | null | undefined): number => {
  if (!raw) return 0;
  const match = raw.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

// ============================================================================
// SKILL ALLOCATION ROW COMPONENT
// ============================================================================

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

  return (
    <div className={`skill-row${showDivider ? " skill-row--divider" : ""}`}>
      <div className="skill-row__name">
        <span className="skill-row__name-text">{formatSkillName(skill.name)}</span>
      </div>
      <div className="skill-row__controls">
        <SpinButton
          value={allocated}
          onChange={(value) => onChangeAllocation(code, value)}
          min={minimum}
          max={maxAllocatable}
          disabled={disableAllocation}
          label={`${skill.name} allocation`}
        />
      </div>
      <div className="skill-row__total">
        <span className="stat-value">{total}</span>
        {bonus > 0 && <span className="skill-row__bonus">(+{bonus})</span>}
      </div>
    </div>
  );
};

// ============================================================================
// CHARACTER SHEET COMPONENT
// ============================================================================

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

  // Memoized skill groupings
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

  // Psionic abilities state
  const psionicAbilities = React.useMemo<PsionicAbility[]>(() => parsePsionicsCsv(psionicsCsv), []);
  const [unlockedPsionics, setUnlockedPsionics] = React.useState<PsionicAbility[]>([]);
  const [psionicEnergyOverrides, setPsionicEnergyOverrides] = React.useState<Map<string, number>>(new Map());
  const storageKey = React.useMemo(() => `${PSIONICS_STORAGE_KEY}:${character.id}`, [character.id]);

  // Notes state
  const [weaponNotes, setWeaponNotes] = React.useState<string>(character.weaponNotes ?? "");
  const [defenseNotes, setDefenseNotes] = React.useState<string>(character.defenseNotes ?? "");
  const [gearNotes, setGearNotes] = React.useState<string>(character.gearNotes ?? "");

  // Ancillary & equipment state
  const [ancillarySelection, setAncillarySelection] = React.useState(() => readAncillarySelection(character.id));
  const [armorOptions, setArmorOptions] = React.useState<ArmorOption[]>([]);
  const [weaponOptions, setWeaponOptions] = React.useState<WeaponCategoryOption[]>([]);
  const [equipmentError, setEquipmentError] = React.useState<string | null>(null);
  const [selectedArmorId, setSelectedArmorId] = React.useState<number | "">("");
  const [selectedWeaponCategory, setSelectedWeaponCategory] = React.useState<string>("");
  const equipmentStorageKey = React.useMemo(() => `characters:equipment:${character.id}`, [character.id]);

  // Computed values
  const energyBase = character.raceKey === "ANZ" ? 140 : 100;
  const energyPerLevel = character.raceKey === "ANZ" ? 14 : 10;
  const energeticMultiplier = ancillarySelection.selected.includes("energetic")
    ? 1 + 0.1 * character.level
    : 1;
  const energy = Math.round((energyBase + energyPerLevel * (character.level - 1)) * energeticMultiplier);
  const fatePoints = character.fatePoints ?? 0;
  const attributeValues = character.attributes ?? {};
  const physicalAttribute = attributeValues?.PHYSICAL ?? 0;
  const speed = Math.max(3, physicalAttribute);
  const selectedArmor = armorOptions.find((armor) => armor.id === selectedArmorId);
  const damageReduction = selectedArmor?.damageReduction ?? 0;
  const selectedWeapon = weaponOptions.find((weapon) => weapon.category === selectedWeaponCategory);
  const weaponDamageBase = parseDamageValue(selectedWeapon?.damage);
  const totalDamage = weaponDamageBase + physicalAttribute;

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

  // Effects for syncing state
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

  React.useEffect(() => {
    setWeaponNotes(character.weaponNotes ?? "");
    setDefenseNotes(character.defenseNotes ?? "");
    setGearNotes(character.gearNotes ?? "");
  }, [character.defenseNotes, character.gearNotes, character.id, character.weaponNotes]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(equipmentStorageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { armorId?: number; weaponCategory?: string };
      if (typeof parsed.armorId === "number") setSelectedArmorId(parsed.armorId);
      if (typeof parsed.weaponCategory === "string") setSelectedWeaponCategory(parsed.weaponCategory);
    } catch (err) {
      console.warn("Unable to read equipment selection", err);
    }
  }, [equipmentStorageKey]);

  const persistEquipment = React.useCallback(
    (next: { armorId?: number | ""; weaponCategory?: string }) => {
      const payload = {
        armorId: next.armorId ?? selectedArmorId,
        weaponCategory: next.weaponCategory ?? selectedWeaponCategory
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(equipmentStorageKey, JSON.stringify(payload));
      }
    },
    [equipmentStorageKey, selectedArmorId, selectedWeaponCategory]
  );

  React.useEffect(() => {
    let isMounted = true;
    setEquipmentError(null);

    if (typeof window === "undefined") return () => undefined;

    const loadEquipment = async () => {
      try {
        const client = getSupabaseClient();
        const [{ data: armorData, error: armorError }, { data: weaponData, error: weaponError }] =
          await Promise.all([
            client
              .from("armors")
              .select("id, armor_name, armor_type, damage_reduction")
              .order("armor_name", { ascending: true }),
            client
              .from("weapon_abilities")
              .select("id, category, damage")
              .order("category", { ascending: true })
          ]);

        if (armorError) throw new Error(armorError.message);
        if (weaponError) throw new Error(weaponError.message);

        const nextArmors = (armorData ?? []).map((row) => ({
          id: row.id,
          name: row.armor_name,
          armorType: row.armor_type ?? undefined,
          damageReduction: row.damage_reduction ?? 0
        }));

        const weaponMap = new Map<string, string | null>();
        (weaponData ?? []).forEach((row) => {
          if (!row.category) return;
          if (!weaponMap.has(row.category)) {
            weaponMap.set(row.category, row.damage ?? null);
          }
        });
        const nextWeapons = Array.from(weaponMap.entries()).map(([category, damage]) => ({ category, damage }));

        if (!isMounted) return;
        setArmorOptions(nextArmors);
        setWeaponOptions(nextWeapons);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Failed to load equipment";
        setEquipmentError(message);
      }
    };

    loadEquipment();

    return () => {
      isMounted = false;
    };
  }, []);

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

  // Event handlers
  const handleNoteBlur = (field: "weaponNotes" | "defenseNotes" | "gearNotes", value: string) => {
    const currentValue = character[field] ?? "";
    if (currentValue === value) return;
    onSaveNotes({ [field]: value });
  };

  const tabs = [
    { value: "Weapons", label: "Weapons" },
    { value: "Defense", label: "Defense" },
    { value: "Gear", label: "Gear" },
    { value: "Psionics", label: "Psionics" },
    { value: "Spells", label: "Spells" },
    { value: "Details", label: "Details" },
    { value: "Feats", label: "Feats" },
    { value: "Actions", label: "Actions" },
  ];

  return (
    <Stack gap="lg" className="character-sheet">
      {/* Character Summary */}
      <Panel>
        <Grid columns="auto-sm" gap="sm" className="character-summary">
          <AttributePill label="Name" value={character.name} />
          <AttributePill label="Level" value={character.level} />
          <AttributePill label="Race" value={raceName || "Unselected"} />
          <AttributePill label="Subrace" value={subraceName || "Unselected"} />
          <AttributePill label="Speed" value={speed} />
        </Grid>
      </Panel>

      {/* Attribute Points */}
      <Card>
        <CardBody>
          <Stack gap="sm">
            <Cluster justify="between" align="center">
              <span className="caption">Attribute Points Available</span>
              <span className={`heading-4 ${attributePointsAvailable > 0 ? "text-success" : ""}`}>
                {attributePointsAvailable}
              </span>
            </Cluster>
            <Grid columns="auto-sm" gap="sm">
              {ATTRIBUTE_DISPLAY.map((attr) => (
                <AttributePill
                  key={attr.key}
                  label={attr.label}
                  value={attributeValues?.[attr.key] ?? 0}
                  action={
                    <Button
                      size="sm"
                      onClick={() => onSpendAttributePoint(attr.key)}
                      disabled={attributePointsAvailable <= 0 || isUpdating}
                    >
                      +1
                    </Button>
                  }
                />
              ))}
            </Grid>
          </Stack>
        </CardBody>
      </Card>

      {/* Main Layout: Skills + Tabs */}
      <div className="character-sheet__layout">
        {/* Left Column: Combat Stats & Skills */}
        <Stack gap="md" className="character-sheet__skills-column">
          {/* Combat Metrics */}
          <Grid columns="auto-sm" gap="sm" className="combat-metrics">
            <AttributePill label="Damage Reduction" value={damageReduction} />
            <AttributePill
              label="Damage"
              value={totalDamage}
              variant="stacked"
              hint={`Base ${weaponDamageBase} + Physical ${physicalAttribute}`}
            />
            <AttributePill label="Fate" value={fatePoints} />
            <AttributePill label="Energy" value={energy} />

            <div className="attribute-pill attribute-pill--stacked">
              <span className="attribute-pill__label">Weapon Category</span>
              <Select
                value={selectedWeaponCategory}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedWeaponCategory(value);
                  persistEquipment({ weaponCategory: value });
                }}
                disabled={weaponOptions.length === 0}
              >
                <option value="">Unarmed/None</option>
                {weaponOptions.map((weapon) => (
                  <option key={weapon.category} value={weapon.category}>
                    {weapon.category}
                  </option>
                ))}
              </Select>
            </div>

            <div className="attribute-pill attribute-pill--stacked">
              <span className="attribute-pill__label">Armor Type</span>
              <Select
                value={selectedArmorId === "" ? "" : String(selectedArmorId)}
                onChange={(e) => {
                  const value = e.target.value;
                  const nextId = value ? Number(value) : "";
                  setSelectedArmorId(nextId);
                  persistEquipment({ armorId: nextId });
                }}
                disabled={armorOptions.length === 0}
              >
                <option value="">No armor</option>
                {armorOptions.map((armor) => (
                  <option key={armor.id} value={armor.id}>
                    {armor.name}
                    {armor.armorType ? ` (${armor.armorType})` : ""}
                  </option>
                ))}
              </Select>
            </div>

            <AttributePill
              label="Martial Bonus AP"
              value={martialBonus.ap}
              variant="stacked"
              hint={martialBonus.notes.size > 0 ? Array.from(martialBonus.notes).join(", ") : undefined}
            />
          </Grid>

          {equipmentError && (
            <p className="body-sm text-warning">{equipmentError}</p>
          )}

          {/* Skill Points Card */}
          <Card variant="flush" className="skills-card">
            <div className="skills-card__header">
              <div>
                <span className="caption">Skill Points Remaining</span>
                <div className={`heading-2 ${remaining < 0 ? "text-danger" : "text-success"}`}>
                  {remaining}
                </div>
              </div>
              <Cluster gap="sm" align="center">
                <span className="caption">Pool: {skillPointPool}</span>
                <Button
                  variant="secondary"
                  onClick={onLockAllocations}
                  disabled={lockDisabled || isLocking}
                  loading={isLocking}
                >
                  Lock Skill Points
                </Button>
              </Cluster>
            </div>

            <p className="skills-card__warning body-sm text-warning">
              Spend all skill points at level up and lock your allocations when finished.
            </p>

            <div className="skills-card__list">
              {skills.length === 0 ? (
                <p className="body-sm text-muted">No skills defined yet.</p>
              ) : (
                <Stack gap="sm">
                  {/* Special Skills */}
                  {specialSkills.map((skill) => (
                    <Card key={getSkillCode(skill)} className="skill-group-card">
                      <CardBody>
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
                      </CardBody>
                    </Card>
                  ))}

                  {/* Grouped Skills */}
                  {groupedSkills.map((group) => (
                    <Card key={group.key} className="skill-group-card">
                      <CardBody>
                        <Stack gap="xs">
                          <h4 className="heading-4 skill-group-card__title">{group.label}</h4>
                          <div className="skill-group-card__list">
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
                        </Stack>
                      </CardBody>
                    </Card>
                  ))}
                </Stack>
              )}
            </div>
          </Card>
        </Stack>

        {/* Right Column: Tabs */}
        <Stack gap="md" className="character-sheet__tabs-column">
          <Tabs value={activeTab} onChange={setActiveTab}>
            <TabList aria-label="Character details">
              {tabs.map((tab) => (
                <Tab key={tab.value} value={tab.value}>
                  {tab.label}
                </Tab>
              ))}
            </TabList>

            <Card className="tab-content-card">
              <CardBody>
                <TabPanel value="Weapons">
                  <Field label="Weapons" hint="Changes are saved on blur.">
                    <Textarea
                      value={weaponNotes}
                      onChange={(e) => setWeaponNotes(e.target.value)}
                      onBlur={() => handleNoteBlur("weaponNotes", weaponNotes)}
                      rows={8}
                      disabled={isUpdating}
                    />
                  </Field>
                </TabPanel>

                <TabPanel value="Defense">
                  <Field label="Defense" hint="Changes are saved on blur.">
                    <Textarea
                      value={defenseNotes}
                      onChange={(e) => setDefenseNotes(e.target.value)}
                      onBlur={() => handleNoteBlur("defenseNotes", defenseNotes)}
                      rows={8}
                      disabled={isUpdating}
                    />
                  </Field>
                </TabPanel>

                <TabPanel value="Gear">
                  <Field label="Gear" hint="Changes are saved on blur.">
                    <Textarea
                      value={gearNotes}
                      onChange={(e) => setGearNotes(e.target.value)}
                      onBlur={() => handleNoteBlur("gearNotes", gearNotes)}
                      rows={8}
                      disabled={isUpdating}
                    />
                  </Field>
                </TabPanel>

                <TabPanel value="Psionics">
                  <Stack gap="md">
                    <p className="body-sm text-muted">
                      Unlocked psionic abilities are stored per character. Edit unlocks on the Psionics page; summaries appear here.
                    </p>
                    {unlockedPsionics.length === 0 ? (
                      <p className="body-sm text-muted">No psionic abilities unlocked yet.</p>
                    ) : (
                      <Stack gap="md">
                        {groupedPsionics.map(({ tree, abilities }) => (
                          <Stack key={tree} gap="sm">
                            <h4 className="heading-4">{tree}</h4>
                            <Grid columns="auto-md" gap="sm">
                              {abilities.map((ability) => (
                                <details key={ability.id} className="psionic-detail">
                                  <summary className="psionic-detail__summary">
                                    <span className="psionic-detail__name">{ability.name}</span>
                                    <Badge variant="psionic">
                                      Tier {ability.tier} · Energy {psionicEnergyOverrides.get(ability.id) ?? ability.energyCost}
                                    </Badge>
                                  </summary>
                                  <div className="psionic-detail__content">
                                    <p className="body-sm">
                                      {replaceMentalAttributePlaceholders(ability.description, attributeValues?.MENTAL ?? 0)}
                                    </p>
                                    {ability.formula && (
                                      <p className="caption text-muted">
                                        Formula: {replaceMentalAttributePlaceholders(ability.formula, attributeValues?.MENTAL ?? 0)}
                                      </p>
                                    )}
                                  </div>
                                </details>
                              ))}
                            </Grid>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </TabPanel>

                {["Spells", "Details", "Feats", "Actions"].map((tabName) => (
                  <TabPanel key={tabName} value={tabName}>
                    <p className="body-sm text-muted">
                      This tab is a placeholder for future content.
                    </p>
                  </TabPanel>
                ))}
              </CardBody>
            </Card>
          </Tabs>
        </Stack>
      </div>
    </Stack>
  );
};

// ============================================================================
// MAIN CHARACTERS PAGE COMPONENT
// ============================================================================

type CharactersPageProps = {
  campaignId?: string;
};

export const CharactersPage: React.FC<CharactersPageProps> = ({ campaignId }) => {
  // State
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [allocationSavingId, setAllocationSavingId] = React.useState<string | null>(null);
  const [lockingAllocationId, setLockingAllocationId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [levelUpdatingId, setLevelUpdatingId] = React.useState<string | null>(null);
  const [generalSavingId, setGeneralSavingId] = React.useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

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

  // Load characters
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
  }, [activeCampaignId]);

  // Auto-select first character
  React.useEffect(() => {
    if (!characters.length) {
      if (!loading && selectedId) setSelectedId(null);
      return;
    }

    if (!selectedId || !characters.some((c) => c.id === selectedId)) {
      setSelectedId(characters[0].id);
    }
  }, [characters, loading, selectedId, setSelectedId]);

  // Handlers
  const handleDeleteCharacter = async (id: string) => {
    const character = characters.find((c) => c.id === id);
    if (!character) return;

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
      setDeleteConfirmOpen(false);
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

  // Derived state
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
      <header className="page__header">
        <h2 className="heading-2">Characters</h2>
        {(definitionsError || error) && (
          <p className="body text-danger">{definitionsError || error}</p>
        )}
      </header>

      <main className="page__content">
        <Panel>
          <Stack gap="md">
            {/* Toolbar */}
            <Cluster gap="sm" align="center" className="characters-toolbar">
              <span className="body-sm" style={{ fontWeight: 600 }}>Selected character</span>
              <Select
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
              </Select>

              <Button variant="primary" onClick={() => navigate(createCharacterPath)}>
                New Character
              </Button>

              <Button
                variant="danger"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={!selectedId || deletingId === selectedId || loadingAny}
              >
                Delete Character
              </Button>

              <Button
                variant="secondary"
                onClick={handleLevelUp}
                disabled={!selectedId || loadingAny || levelUpdatingId === selectedId || remaining > 0}
                loading={levelUpdatingId === selectedId}
              >
                Level Up
              </Button>
            </Cluster>

            {/* Content */}
            {loadingAny && <p className="body text-muted">Loading sheet...</p>}
            {!loadingAny && !selectedCharacter && (
              <p className="body text-muted">Select a character to view the sheet.</p>
            )}
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
          </Stack>
        </Panel>
      </main>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => selectedId && handleDeleteCharacter(selectedId)}
        title="Delete Character"
        message={`Are you sure you want to delete ${selectedCharacter?.name ?? "this character"}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deletingId === selectedId}
      />
    </div>
  );
};
