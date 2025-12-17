import React from "react";
import armorCsv from "../../data/armor.csv?raw";
import weaponsCsv from "../../data/weapons.csv?raw";
import { api, Character } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import { EquipmentKind, MartialAbility, parseMartialCsv } from "./martialUtils";
import { NumberStepper } from "../common/NumberStepper";

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

  return (
    <button
      onClick={() => onPurchase(ability)}
      disabled={purchased || !canAfford}
      style={{
        width: "100%",
        textAlign: "left",
        background: purchased ? "linear-gradient(135deg, #142015, #0f171b)" : "#0f141c",
        border: purchased ? "1px solid #7bdc70" : "1px solid #1f2b39",
        borderRadius: 12,
        padding: "0.75rem 0.85rem",
        color: "#e6edf7",
        cursor: purchased || !canAfford ? "not-allowed" : "pointer",
        opacity: purchased ? 1 : canAfford ? 1 : 0.7,
        transition: "border-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease",
        boxShadow: purchased
          ? "0 6px 18px rgba(82, 255, 168, 0.12), 0 0 0 1px rgba(123, 220, 112, 0.25)"
          : "0 10px 30px rgba(0,0,0,0.35)",
        minHeight: 126,
        alignItems: "stretch",
        display: "flex"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.2 }}>{ability.name}</div>
            <div style={{ fontSize: 11, color: "#9aa3b5", textTransform: "uppercase" }}>{ability.abilityType}</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {ability.twoHanded && (
              <span
                style={{
                  background: "#151d2a",
                  border: "1px solid #293546",
                  borderRadius: 999,
                  padding: "0.2rem 0.55rem",
                  fontSize: 11,
                  color: "#f6c177",
                  whiteSpace: "nowrap"
                }}
              >
                Two-Handed
              </span>
            )}
            <span
              style={{
                background: "linear-gradient(135deg, #10322c, #124257)",
                border: "1px solid #1f4e5f",
                borderRadius: 999,
                padding: "0.2rem 0.55rem",
                fontSize: 11,
                color: "#9ae6b4",
                whiteSpace: "nowrap"
              }}
            >
              {ability.mpCost} MP
            </span>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: 8
          }}
        >
          <StatPill label="Energy" value={ability.energyCost} />
          <StatPill label="Action" value={ability.actionPointCost} />
          <StatPill label="Damage" value={ability.damage} />
          <StatPill label="Type" value={ability.damageType} />
          <StatPill label="Range" value={ability.range} />
        </div>
        <div style={{ fontSize: 13, color: "#d8deea", lineHeight: 1.5 }}>{ability.description}</div>
        <div
          style={{
            fontSize: 11,
            color: purchased ? "#8ee59f" : canAfford ? "#9aa3b5" : "#f09483",
            textTransform: "uppercase",
            letterSpacing: 0.4
          }}
        >
          {statusLabel}
        </div>
      </div>
    </button>
  );
};

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      background: "#0c121a",
      border: "1px solid #1c2735",
      borderRadius: 8,
      padding: "0.4rem 0.55rem",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 6,
      color: "#c5ccd9",
      fontSize: 11,
      lineHeight: 1.2,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)"
    }}
  >
    <span style={{ color: "#8d96a7", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
    <span style={{ fontWeight: 700 }}>{value}</span>
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
    return <p style={{ color: "#f55" }}>{characterError}</p>;
  }

  if (!selectedCharacter) {
    return <p>Selected character could not be found.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
          gap: "1rem",
          flexWrap: "wrap",
          background: "linear-gradient(120deg, #0f141d, #0b1222)",
          border: "1px solid #1d2634",
          padding: "1rem 1.1rem",
          borderRadius: 14,
          boxShadow: "0 16px 42px rgba(0,0,0,0.35)"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ margin: 0, letterSpacing: 0.4 }}>Martial Prowess</h1>
          <p style={{ margin: 0, color: "#c5ccd9", fontSize: 14 }}>Character: {selectedCharacter.name}</p>
          <p style={{ margin: 0, color: "#7f8898", fontSize: 12 }}>
            Assign MP to a category, then buy abilities from that category's pool.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div
            style={{
              background: "#0f1723",
              border: "1px solid #223447",
              borderRadius: 10,
              padding: "0.9rem 1rem",
              minWidth: 220,
              color: "#c5ccd9",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxShadow: "0 10px 28px rgba(0,0,0,0.25)"
            }}
          >
            <span style={{ fontSize: 13, letterSpacing: 0.2, color: "#9aa3b5" }}>Martial Prowess MP</span>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#9ae6b4" }}>{martialProwessPool}</div>
            <span style={{ fontSize: 12, color: "#7f8898" }}>
              Linked to the Martial Prowess skill on the Characters page.
            </span>
          </div>
          <div
            style={{
              background: "linear-gradient(135deg, #0d1f27, #0f2f36)",
              border: "1px solid #1d3a43",
              borderRadius: 12,
              padding: "0.9rem 1.1rem",
              minWidth: 200,
              textAlign: "center",
              color: "#d8deea",
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4
            }}
          >
            <div style={{ fontSize: 13, color: "#9aa3b5", textTransform: "uppercase", letterSpacing: 1.2 }}>
              Unassigned MP
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#9ae6b4" }}>{unassignedMp}</div>
            <div style={{ fontSize: 12, color: "#7f8898" }}>Allocate MP to categories before purchasing.</div>
          </div>
          <div
            style={{
              background: "linear-gradient(135deg, #0d1f27, #0f2f36)",
              border: "1px solid #1d3a43",
              borderRadius: 12,
              padding: "0.9rem 1.1rem",
              minWidth: 200,
              textAlign: "center",
              color: "#d8deea",
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 4
            }}
          >
            <div style={{ fontSize: 13, color: "#9aa3b5", textTransform: "uppercase", letterSpacing: 1.2 }}>
              MP Remaining
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: "#9ae6b4" }}>{remainingMp}</div>
          </div>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 280px) 1fr",
          gap: "1rem",
          alignItems: "start"
        }}
      >
        <aside
          style={{
            background: "#0b1018",
            border: "1px solid #1b2634",
            borderRadius: 14,
            padding: "0.85rem 0.75rem 1rem",
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            position: "sticky",
            top: 12,
            alignSelf: "start",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#e6edf7", fontWeight: 700, letterSpacing: 0.2 }}>Categories</div>
            <div style={{ color: "#7f8898", fontSize: 12 }}>{categoryEntries.length} total</div>
          </div>

          {(["Weapon", "Armor"] as EquipmentKind[]).map((kind) => {
            const options = categoriesByKind.get(kind) ?? [];
            if (options.length === 0) return null;

            return (
              <div key={kind} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ color: "#9aa3b5", fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase" }}>
                  {kind}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background: isActive
                            ? "linear-gradient(135deg, #123140, #0f2234)"
                            : "#0f151f",
                          border: isActive ? "1px solid #2b495b" : "1px solid #1d2837",
                          color: "#d8deea",
                          borderRadius: 10,
                          padding: "0.55rem 0.65rem",
                          cursor: "pointer",
                          boxShadow: isActive ? "0 10px 24px rgba(0,0,0,0.28)" : "none",
                          textAlign: "left",
                          transition: "border-color 0.2s ease, background 0.2s ease"
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{entry.category}</div>
                          <div style={{ color: "#9aa3b5", fontSize: 12 }}>
                            {entry.abilities.length} abilities
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                          <div
                            style={{
                              background: "#12202c",
                              border: "1px solid #243547",
                              borderRadius: 999,
                              padding: "0.2rem 0.55rem",
                              color: "#8ee59f",
                              fontSize: 11,
                              minWidth: 80,
                              textAlign: "center"
                            }}
                          >
                            {purchasedCount} owned
                          </div>
                          <div style={{ color: "#9aa3b5", fontSize: 11, textAlign: "right", lineHeight: 1.4 }}>
                            <div>{allocated} MP allocated</div>
                            <div style={{ color: remainingInCategory > 0 ? "#9ae6b4" : "#f09483" }}>
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

        <main style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {activeCategory ? (
            <section
              style={{
                background: "linear-gradient(160deg, rgba(16,20,27,0.94), rgba(11,16,23,0.96))",
                border: "1px solid #18212d",
                borderRadius: 14,
                padding: "1rem 1.05rem 1.1rem",
                boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
                display: "flex",
                flexDirection: "column",
                gap: "0.9rem"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap"
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <h2 style={{ margin: 0, color: "#e6edf7", fontSize: 18, letterSpacing: 0.3 }}>
                      {activeCategory.category}
                    </h2>
                    <span
                      style={{
                        background: "#152234",
                        border: "1px solid #1f3042",
                        color: "#9aa3b5",
                        borderRadius: 999,
                        padding: "0.2rem 0.6rem",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: 0.4
                      }}
                    >
                      {activeCategory.kind}
                    </span>
                  </div>
                  <span style={{ color: "#9aa3b5", fontSize: 13 }}>
                    Allocate MP to this discipline, then spend that pool on the abilities you want to master.
                  </span>
                  <label
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      background: "#0f1723",
                      border: "1px solid #1d2736",
                      borderRadius: 10,
                      padding: "0.75rem 0.85rem",
                      maxWidth: 360
                    }}
                  >
                    <div style={{ color: "#c5ccd9", fontWeight: 600, fontSize: 13 }}>Category MP Allocation</div>
                    <NumberStepper
                      value={activeCategoryAllocation}
                      min={activeCategorySpent}
                      max={Math.max(activeCategoryAllocation + unassignedMp, activeCategorySpent)}
                      onChange={(next) => updateCategoryPool(activeCategory.key, next)}
                      ariaLabel="Category MP Allocation"
                      inputStyle={{ fontSize: 15, fontWeight: 600 }}
                    />
                    <div style={{ fontSize: 12, color: "#7f8898" }}>
                      Requires at least {activeCategorySpent} MP to cover purchased abilities.
                    </div>
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  <StatPill label="Abilities" value={`${activeCategory.abilities.length}`} />
                  <StatPill
                    label="Purchased"
                    value={`${activeCategory.abilities.filter((ability) => state.purchased.has(ability.id)).length}`}
                  />
                  <StatPill label="Allocated" value={`${activeCategoryAllocation}`} />
                  <StatPill label="Category Remaining" value={`${activeCategoryRemaining}`} />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "0.75rem",
                  paddingTop: 4
                }}
              >
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
            <div
              style={{
                background: "#0b1018",
                border: "1px solid #1b2634",
                borderRadius: 12,
                padding: "1rem",
                color: "#9aa3b5"
              }}
            >
              Choose a category on the left to view its abilities.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
