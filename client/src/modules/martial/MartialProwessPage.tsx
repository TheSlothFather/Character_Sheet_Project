import React from "react";
import armorCsv from "../../data/armor.csv?raw";
import weaponsCsv from "../../data/weapons.csv?raw";
import { api, Character } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import { EquipmentKind, MartialAbility, parseMartialCsv } from "./martialUtils";
import "./MartialProwessPage.css";

interface MartialState {
  categoryPools: Record<string, number>;
  purchased: Set<string>;
}

const STORAGE_KEY = "martial_prowess_v2";

const abilityKey = (ability: MartialAbility): string => `${ability.kind}:${ability.category}`;

const computeSpentByCategory = (
  purchased: Set<string>,
  abilityMap: Map<string, MartialAbility>
): Map<string, number> => {
  const spent = new Map<string, number>();
  purchased.forEach((id) => {
    const ability = abilityMap.get(id);
    if (!ability) return;
    const key = abilityKey(ability);
    spent.set(key, (spent.get(key) ?? 0) + ability.mpCost);
  });
  return spent;
};

const loadPersistedState = (
  storageKey: string | null,
  categoryEntries: { key: string }[],
  abilityIds: Set<string>
): MartialState => {
  if (typeof window === "undefined" || !storageKey) {
    return { categoryPools: {}, purchased: new Set() };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { categoryPools: {}, purchased: new Set() };
    const parsed = JSON.parse(raw) as { purchased?: string[]; categoryPools?: Record<string, unknown> };
    const purchased = Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((id) => abilityIds.has(id))
      : [];
    const categoryKeys = new Set(categoryEntries.map((entry) => entry.key));
    const categoryPools: Record<string, number> = {};
    if (parsed.categoryPools && typeof parsed.categoryPools === "object") {
      Object.entries(parsed.categoryPools).forEach(([key, value]) => {
        if (!categoryKeys.has(key)) return;
        const numeric = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        if (numeric > 0) categoryPools[key] = numeric;
      });
    }
    return { categoryPools, purchased: new Set(purchased) };
  } catch (err) {
    console.warn("Unable to parse martial prowess state", err);
    return { categoryPools: {}, purchased: new Set() };
  }
};

const persistState = (storageKey: string | null, state: MartialState) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const payload = JSON.stringify({
      categoryPools: state.categoryPools,
      purchased: Array.from(state.purchased)
    });
    window.localStorage.setItem(storageKey, payload);
  } catch (err) {
    console.warn("Unable to persist martial prowess state", err);
  }
};

const AbilityCard: React.FC<{
  ability: MartialAbility;
  purchased: boolean;
  remainingMp: number;
  onPurchase: (ability: MartialAbility) => void;
}> = ({ ability, purchased, remainingMp, onPurchase }) => {
  const canAfford = remainingMp >= ability.mpCost;
  const statusLabel = purchased ? "Purchased" : canAfford ? "Unlocked" : "Insufficient MP";
  const statusClass = purchased
    ? "martial-ability__status martial-ability__status--purchased"
    : canAfford
    ? "martial-ability__status martial-ability__status--available"
    : "martial-ability__status martial-ability__status--blocked";

  return (
    <button
      onClick={() => onPurchase(ability)}
      disabled={purchased || !canAfford}
      className={`martial-ability${purchased ? " martial-ability--purchased" : ""}${
        !purchased && !canAfford ? " martial-ability--blocked" : ""
      }`}
    >
      <div className="martial-ability__content">
        <div className="martial-ability__header">
          <div className="martial-ability__title-block">
            <div className="martial-ability__title">{ability.name}</div>
            <div className="martial-ability__type">{ability.abilityType}</div>
          </div>
          <div className="martial-ability__tags">
            {ability.twoHanded && (
              <span className="martial-ability__tag martial-ability__tag--two-handed">
                Two-Handed
              </span>
            )}
            <span className="martial-ability__tag martial-ability__tag--cost">
              {ability.mpCost} MP
            </span>
          </div>
        </div>
        <div className="martial-ability__stats">
          <StatPill label="Energy" value={ability.energyCost} />
          <StatPill label="Action" value={ability.actionPointCost} />
          <StatPill label="Damage" value={ability.damage} />
          <StatPill label="Type" value={ability.damageType} />
          <StatPill label="Range" value={ability.range} />
        </div>
        <div className="martial-ability__description">{ability.description}</div>
        <div className={statusClass}>{statusLabel}</div>
      </div>
    </button>
  );
};

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="martial-stat">
    <span className="martial-stat__label">{label}</span>
    <span className="martial-stat__value">{value}</span>
  </div>
);

export const MartialProwessPage: React.FC = () => {
  const abilities = React.useMemo(
    () => [...parseMartialCsv(weaponsCsv, "Weapon"), ...parseMartialCsv(armorCsv, "Armor")],
    []
  );

  const abilityIds = React.useMemo(() => new Set(abilities.map((a) => a.id)), [abilities]);
  const abilityMap = React.useMemo(() => new Map(abilities.map((a) => [a.id, a])), [abilities]);

  const grouped = React.useMemo(() => {
    const map = new Map<EquipmentKind, Map<string, MartialAbility[]>>();
    for (const ability of abilities) {
      if (!map.has(ability.kind)) {
        map.set(ability.kind, new Map());
      }
      const byCategory = map.get(ability.kind)!;
      if (!byCategory.has(ability.category)) {
        byCategory.set(ability.category, []);
      }
      byCategory.get(ability.category)!.push(ability);
    }

    for (const categories of map.values()) {
      for (const list of categories.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return map;
  }, [abilities]);

  const categoryEntries = React.useMemo(() => {
    const entries: { key: string; kind: EquipmentKind; category: string; abilities: MartialAbility[] }[] = [];
    grouped.forEach((categories, kind) => {
      categories.forEach((abilitiesInCategory, category) => {
        entries.push({ key: `${kind}:${category}`, kind, category, abilities: abilitiesInCategory });
      });
    });
    return entries.sort((a, b) => a.category.localeCompare(b.category));
  }, [grouped]);

  const { selectedId } = useSelectedCharacter();
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacter, setLoadingCharacter] = React.useState(false);
  const [activeCategoryKey, setActiveCategoryKey] = React.useState<string | null>(null);

  const storageKey = React.useMemo(() => (selectedId ? `${STORAGE_KEY}:${selectedId}` : null), [selectedId]);

  const [state, setState] = React.useState<MartialState>(() =>
    loadPersistedState(storageKey, categoryEntries, abilityIds)
  );

  const categoriesByKind = React.useMemo(() => {
    const map = new Map<EquipmentKind, typeof categoryEntries>();
    for (const entry of categoryEntries) {
      if (!map.has(entry.kind)) {
        map.set(entry.kind, []);
      }
      map.get(entry.kind)!.push(entry);
    }
    map.forEach((list) => list.sort((a, b) => a.category.localeCompare(b.category)));
    return map;
  }, [categoryEntries]);

  const activeCategory = React.useMemo(
    () => categoryEntries.find((entry) => entry.key === activeCategoryKey) ?? null,
    [activeCategoryKey, categoryEntries]
  );

  React.useEffect(() => {
    if (categoryEntries.length === 0) return;
    if (!activeCategoryKey || !categoryEntries.some((entry) => entry.key === activeCategoryKey)) {
      setActiveCategoryKey(categoryEntries[0].key);
    }
  }, [activeCategoryKey, categoryEntries]);

  React.useEffect(() => {
    setSelectedCharacter(null);
    if (!selectedId) {
      setCharacterError("Select a character on the Characters page to manage martial prowess.");
      setLoadingCharacter(false);
      return;
    }

    setCharacterError(null);
    setLoadingCharacter(true);
    api
      .listCharacters()
      .then((list) => {
        const found = list.find((c) => c.id === selectedId) ?? null;
        setSelectedCharacter(found);
        if (!found) {
          setCharacterError("Selected character not found. Choose one on the Characters page.");
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load character.";
        setCharacterError(message);
      })
      .finally(() => setLoadingCharacter(false));
  }, [selectedId]);

  const martialProwessPool = React.useMemo(() => {
    const allocations = selectedCharacter?.skillAllocations ?? {};
    const bonuses = selectedCharacter?.skillBonuses ?? {};
    const base = allocations.MARTIAL_PROWESS ?? 0;
    const bonus = bonuses.MARTIAL_PROWESS ?? 0;
    return Math.max(0, base + bonus);
  }, [selectedCharacter]);

  const normalizeState = React.useCallback(
    (input: MartialState): MartialState => {
      const categoryKeys = categoryEntries.map((entry) => entry.key);
      const purchased = new Set<string>();
      input.purchased.forEach((id) => {
        if (abilityMap.has(id)) purchased.add(id);
      });

      const spentByCategory = computeSpentByCategory(purchased, abilityMap);
      const totalSpent = Array.from(spentByCategory.values()).reduce((sum, val) => sum + val, 0);

      const categoryPools: Record<string, number> = {};
      let totalAllocated = 0;
      categoryKeys.forEach((key) => {
        const min = spentByCategory.get(key) ?? 0;
        const current = input.categoryPools[key] ?? 0;
        const value = Math.max(min, Number.isFinite(current) ? Math.floor(current) : 0);
        categoryPools[key] = value;
        totalAllocated += value;
      });

      const allocationCap = Math.max(martialProwessPool, totalSpent);
      let excess = Math.max(0, totalAllocated - allocationCap);
      if (excess > 0) {
        for (const key of categoryKeys) {
          if (excess <= 0) break;
          const min = spentByCategory.get(key) ?? 0;
          const extra = categoryPools[key] - min;
          if (extra <= 0) continue;
          const deduction = Math.min(extra, excess);
          categoryPools[key] -= deduction;
          excess -= deduction;
        }
      }

      const poolsChanged =
        categoryKeys.some((key) => (input.categoryPools[key] ?? 0) !== categoryPools[key]) ||
        Object.keys(input.categoryPools).some((key) => !categoryKeys.includes(key));
      const purchasedChanged =
        input.purchased.size !== purchased.size ||
        Array.from(input.purchased).some((id) => !purchased.has(id));

      if (!poolsChanged && !purchasedChanged) return input;
      return { categoryPools, purchased };
    },
    [abilityMap, categoryEntries, martialProwessPool]
  );

  React.useEffect(() => {
    const loaded = loadPersistedState(storageKey, categoryEntries, abilityIds);
    setState(normalizeState(loaded));
  }, [abilityIds, categoryEntries, normalizeState, storageKey]);

  React.useEffect(() => {
    setState((prev) => normalizeState(prev));
  }, [normalizeState]);

  React.useEffect(() => {
    persistState(storageKey, state);
  }, [state, storageKey]);

  const spentByCategory = React.useMemo(
    () => computeSpentByCategory(state.purchased, abilityMap),
    [abilityMap, state.purchased]
  );

  const totalSpent = React.useMemo(
    () => Array.from(spentByCategory.values()).reduce((sum, value) => sum + value, 0),
    [spentByCategory]
  );

  const totalAllocated = React.useMemo(
    () => categoryEntries.reduce((sum, entry) => sum + (state.categoryPools[entry.key] ?? 0), 0),
    [categoryEntries, state.categoryPools]
  );

  const unassignedMp = Math.max(0, martialProwessPool - totalAllocated);
  const remainingMp = Math.max(0, martialProwessPool - totalSpent);

  const remainingByCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    categoryEntries.forEach((entry) => {
      const pool = state.categoryPools[entry.key] ?? 0;
      const spent = spentByCategory.get(entry.key) ?? 0;
      map.set(entry.key, Math.max(0, pool - spent));
    });
    return map;
  }, [categoryEntries, spentByCategory, state.categoryPools]);

  const activeCategoryAllocation = activeCategory ? state.categoryPools[activeCategory.key] ?? 0 : 0;
  const activeCategoryRemaining = activeCategory ? remainingByCategory.get(activeCategory.key) ?? 0 : 0;
  const activeCategorySpent = Math.max(0, activeCategoryAllocation - activeCategoryRemaining);

  const handlePurchase = (ability: MartialAbility) => {
    const key = abilityKey(ability);
    setState((prev) => {
      if (prev.purchased.has(ability.id)) return prev;

      const spent = computeSpentByCategory(prev.purchased, abilityMap);
      const pool = prev.categoryPools[key] ?? 0;
      const available = pool - (spent.get(key) ?? 0);
      if (available < ability.mpCost) return prev;

      const nextPurchased = new Set(prev.purchased);
      nextPurchased.add(ability.id);
      return { ...prev, purchased: nextPurchased };
    });
  };

  const updateCategoryPool = (categoryKey: string, value: number) => {
    setState((prev) => {
      const purchased = new Set(Array.from(prev.purchased).filter((id) => abilityMap.has(id)));
      const spent = computeSpentByCategory(purchased, abilityMap);
      const totalSpentLocal = Array.from(spent.values()).reduce((sum, val) => sum + val, 0);
      const allocationCap = Math.max(martialProwessPool, totalSpentLocal);

      const categoryKeys = categoryEntries.map((entry) => entry.key);
      const pools: Record<string, number> = {};
      categoryKeys.forEach((key) => {
        const min = spent.get(key) ?? 0;
        const current = prev.categoryPools[key] ?? 0;
        pools[key] = Math.max(min, Number.isFinite(current) ? Math.floor(current) : 0);
      });

      const min = spent.get(categoryKey) ?? 0;
      const desired = Math.max(min, Number.isFinite(value) ? Math.floor(value) : 0);
      const totalOthers = categoryKeys.reduce((sum, key) => (key === categoryKey ? sum : sum + pools[key]), 0);
      const maxForCategory = allocationCap - totalOthers;
      const nextValue = Math.max(min, Math.min(desired, maxForCategory));

      if (pools[categoryKey] === nextValue) return prev;
      return { categoryPools: { ...pools, [categoryKey]: nextValue }, purchased };
    });
  };

  if (!selectedId) {
    return <p>Please select a character on the Characters page to view martial prowess.</p>;
  }

  if (loadingCharacter) {
    return <p>Loading character...</p>;
  }

  if (characterError) {
    return <p className="martial-page__error">{characterError}</p>;
  }

  if (!selectedCharacter) {
    return <p>Selected character could not be found.</p>;
  }

  return (
    <div className="martial-page">
      <header className="martial-page__header">
        <div className="martial-page__header-text">
          <h1 className="martial-page__title">Martial Prowess</h1>
          <p className="martial-page__subtitle">Character: {selectedCharacter.name}</p>
          <p className="martial-page__hint">
            Assign MP to a category, then buy abilities from that category's pool.
          </p>
        </div>
        <div className="martial-page__summary">
          <div className="martial-page__stat-card">
            <span className="martial-page__stat-label">Martial Prowess MP</span>
            <div className="martial-page__stat-value">{martialProwessPool}</div>
            <span className="martial-page__stat-note">
              Linked to the Martial Prowess skill on the Characters page.
            </span>
          </div>
          <div className="martial-page__stat-card martial-page__stat-card--accent">
            <div className="martial-page__stat-title">
              Unassigned MP
            </div>
            <div className="martial-page__stat-value martial-page__stat-value--large">{unassignedMp}</div>
            <div className="martial-page__stat-note">Allocate MP to categories before purchasing.</div>
          </div>
          <div className="martial-page__stat-card martial-page__stat-card--accent">
            <div className="martial-page__stat-title">
              MP Remaining
            </div>
            <div className="martial-page__stat-value martial-page__stat-value--large">{remainingMp}</div>
          </div>
        </div>
      </header>

      <div className="martial-page__layout">
        <aside className="martial-page__sidebar">
          <div className="martial-page__sidebar-header">
            <div className="martial-page__sidebar-title">Categories</div>
            <div className="martial-page__sidebar-count">{categoryEntries.length} total</div>
          </div>

          {(["Weapon", "Armor"] as EquipmentKind[]).map((kind) => {
            const options = categoriesByKind.get(kind) ?? [];
            if (options.length === 0) return null;

            return (
              <div key={kind} className="martial-page__kind">
                <div className="martial-page__kind-label">
                  {kind}
                </div>
                <div className="martial-page__kind-list">
                  {options.map((entry) => {
                    const purchasedCount = entry.abilities.filter((ability) => state.purchased.has(ability.id)).length;
                    const isActive = activeCategoryKey === entry.key;
                    const allocated = state.categoryPools[entry.key] ?? 0;
                    const remainingInCategory = remainingByCategory.get(entry.key) ?? 0;
                    const spentInCategory = Math.max(0, allocated - remainingInCategory);

                    return (
                      <button
                        key={entry.key}
                        onClick={() => setActiveCategoryKey(entry.key)}
                        className={`martial-page__category${isActive ? " martial-page__category--active" : ""}`}
                      >
                        <div className="martial-page__category-info">
                          <div className="martial-page__category-name">{entry.category}</div>
                          <div className="martial-page__category-meta">
                            {entry.abilities.length} abilities
                          </div>
                        </div>
                        <div className="martial-page__category-stats">
                          <div className="martial-page__owned">
                            {purchasedCount} owned
                          </div>
                          <div className="martial-page__category-detail">
                            <div>{allocated} MP allocated</div>
                            <div className={remainingInCategory > 0 ? "martial-page__remaining--ok" : "martial-page__remaining--low"}>
                              {remainingInCategory} MP left ({spentInCategory} spent)
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </aside>

        <main className="martial-page__main">
          {activeCategory ? (
            <section className="martial-page__detail">
              <div className="martial-page__detail-header">
                <div className="martial-page__detail-info">
                  <div className="martial-page__detail-title">
                    <h2 className="martial-page__detail-name">
                      {activeCategory.category}
                    </h2>
                    <span className="martial-page__detail-kind">
                      {activeCategory.kind}
                    </span>
                  </div>
                  <span className="martial-page__detail-hint">
                    Allocate MP to this discipline, then spend that pool on the abilities you want to master.
                  </span>
                  <label className="martial-page__allocation">
                    <div className="martial-page__allocation-title">Category MP Allocation</div>
                    <input
                      type="number"
                      value={activeCategoryAllocation}
                      min={activeCategorySpent}
                      max={Math.max(activeCategoryAllocation + unassignedMp, activeCategorySpent)}
                      onChange={(e) => updateCategoryPool(activeCategory.key, Number(e.target.value) || 0)}
                      onWheel={(e) => e.preventDefault()}
                      className="martial-page__allocation-input"
                    />
                    <div className="martial-page__allocation-note">
                      Requires at least {activeCategorySpent} MP to cover purchased abilities.
                    </div>
                  </label>
                </div>
                <div className="martial-page__detail-stats">
                  <StatPill label="Abilities" value={`${activeCategory.abilities.length}`} />
                  <StatPill
                    label="Purchased"
                    value={`${activeCategory.abilities.filter((ability) => state.purchased.has(ability.id)).length}`}
                  />
                  <StatPill label="Allocated" value={`${activeCategoryAllocation}`} />
                  <StatPill label="Category Remaining" value={`${activeCategoryRemaining}`} />
                </div>
              </div>

              <div className="martial-page__ability-grid">
                {activeCategory.abilities.map((ability) => {
                  const purchased = state.purchased.has(ability.id);
                  return (
                    <AbilityCard
                      key={ability.id}
                      ability={ability}
                      purchased={purchased}
                      remainingMp={activeCategoryRemaining}
                      onPurchase={handlePurchase}
                    />
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="martial-page__empty">
              Choose a category on the left to view its abilities.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
