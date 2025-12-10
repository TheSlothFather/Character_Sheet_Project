import React from "react";
import armorCsv from "../../data/armor.csv?raw";
import weaponsCsv from "../../data/weapons.csv?raw";
import { api, Character } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import { DEFAULT_MP_POOL, EquipmentKind, MartialAbility, parseMartialCsv } from "./martialUtils";

interface MartialState {
  mpPool: number;
  purchased: Set<string>;
}

const STORAGE_KEY = "martial_prowess_v1";

const loadPersistedState = (storageKey: string | null, defaultMp: number, abilityIds: Set<string>): MartialState => {
  if (typeof window === "undefined" || !storageKey) {
    return { mpPool: defaultMp, purchased: new Set() };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { mpPool: defaultMp, purchased: new Set() };
    const parsed = JSON.parse(raw) as { mpPool?: number; purchased?: string[] };
    const mpPool = typeof parsed.mpPool === "number" && parsed.mpPool >= 0 ? parsed.mpPool : defaultMp;
    const purchased = Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((id) => abilityIds.has(id))
      : [];
    return { mpPool, purchased: new Set(purchased) };
  } catch (err) {
    console.warn("Unable to parse martial prowess state", err);
    return { mpPool: defaultMp, purchased: new Set() };
  }
};

const persistState = (storageKey: string | null, state: MartialState) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const payload = JSON.stringify({ mpPool: state.mpPool, purchased: Array.from(state.purchased) });
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
  const abilityCostMap = React.useMemo(() => new Map(abilities.map((a) => [a.id, a.mpCost])), [abilities]);

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

  const categoryKeys = React.useMemo(() => {
    const keys: string[] = [];
    grouped.forEach((categories, kind) => {
      categories.forEach((_, category) => {
        keys.push(`${kind}:${category}`);
      });
    });
    return keys.sort();
  }, [grouped]);

  const { selectedId } = useSelectedCharacter();
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacter, setLoadingCharacter] = React.useState(false);
  const [collapsedCategories, setCollapsedCategories] = React.useState<Record<string, boolean>>({});

  const storageKey = React.useMemo(() => (selectedId ? `${STORAGE_KEY}:${selectedId}` : null), [selectedId]);

  const [state, setState] = React.useState<MartialState>(() => loadPersistedState(storageKey, DEFAULT_MP_POOL, abilityIds));

  React.useEffect(() => {
    setState(loadPersistedState(storageKey, DEFAULT_MP_POOL, abilityIds));
  }, [abilityIds, storageKey]);

  React.useEffect(() => {
    persistState(storageKey, state);
  }, [state, storageKey]);

  React.useEffect(() => {
    setCollapsedCategories((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of categoryKeys) {
        if (!(key in next)) {
          next[key] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [categoryKeys]);

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

  const spentMp = React.useMemo(
    () => Array.from(state.purchased).reduce((sum, id) => sum + (abilityCostMap.get(id) ?? 0), 0),
    [abilityCostMap, state.purchased]
  );

  const remainingMp = Math.max(0, state.mpPool - spentMp);

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllCategoriesCollapsed = (value: boolean) => {
    setCollapsedCategories((prev) => {
      const next: Record<string, boolean> = { ...prev };
      let changed = false;
      for (const key of categoryKeys) {
        if (next[key] !== value) {
          next[key] = value;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  };

  const handlePurchase = (ability: MartialAbility) => {
    setState((prev) => {
      if (prev.purchased.has(ability.id)) return prev;
      const mpCost = ability.mpCost;
      const spent = Array.from(prev.purchased).reduce((sum, id) => sum + (abilityCostMap.get(id) ?? 0), 0);
      const available = prev.mpPool - spent;
      if (available < mpCost) return prev;

      const nextPurchased = new Set(prev.purchased);
      nextPurchased.add(ability.id);
      return { ...prev, purchased: nextPurchased };
    });
  };

  const updateMpPool = (value: number) => {
    setState((prev) => ({ ...prev, mpPool: Math.max(0, value) }));
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

  const renderSection = (kind: EquipmentKind, title: string) => {
    const categories = grouped.get(kind);
    if (!categories || categories.size === 0) return null;
    const orderedCategories = Array.from(categories.keys()).sort((a, b) => a.localeCompare(b));

    return (
      <section
        key={kind}
        style={{
          background: "linear-gradient(160deg, rgba(16,20,27,0.94), rgba(11,16,23,0.96))",
          border: "1px solid #18212d",
          borderRadius: 14,
          padding: "1rem 1.05rem 1.1rem",
          boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          gap: "0.8rem"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2 style={{ margin: 0, color: "#e6edf7", fontSize: 18, letterSpacing: 0.3 }}>{title}</h2>
            <span style={{ color: "#9aa3b5", fontSize: 12 }}>{categories.size} categories</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setAllCategoriesCollapsed(false)}
              style={{
                background: "#142231",
                color: "#d8deea",
                border: "1px solid #223447",
                borderRadius: 10,
                padding: "0.4rem 0.7rem",
                cursor: "pointer"
              }}
            >
              Expand all
            </button>
            <button
              onClick={() => setAllCategoriesCollapsed(true)}
              style={{
                background: "#0f1721",
                color: "#d8deea",
                border: "1px solid #223447",
                borderRadius: 10,
                padding: "0.4rem 0.7rem",
                cursor: "pointer"
              }}
            >
              Collapse all
            </button>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "0.85rem"
          }}
        >
          {orderedCategories.map((category) => {
            const key = `${kind}:${category}`;
            const collapsed = collapsedCategories[key] ?? false;
            const abilitiesInCategory = categories.get(category) ?? [];
            const purchasedCount = abilitiesInCategory.filter((ability) =>
              state.purchased.has(ability.id)
            ).length;

            return (
              <div
                key={category}
                style={{
                  border: "1px solid #1b2634",
                  borderRadius: 12,
                  padding: "0.75rem 0.85rem",
                  background: "#0b1018",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.28)"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontWeight: 800, color: "#e0e5ef", fontSize: 14 }}>{category}</div>
                    <div style={{ display: "flex", gap: 8, color: "#7f8898", fontSize: 12 }}>
                      <span>{abilitiesInCategory.length} abilities</span>
                      <span style={{ color: "#8ee59f" }}>{purchasedCount} purchased</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleCategory(key)}
                    style={{
                      background: collapsed ? "#101722" : "#152234",
                      color: "#d8deea",
                      border: "1px solid #243548",
                      borderRadius: 10,
                      padding: "0.35rem 0.65rem",
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    {collapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!collapsed && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: "0.75rem",
                      paddingTop: 4
                    }}
                  >
                    {abilitiesInCategory.map((ability) => {
                      const purchased = state.purchased.has(ability.id);
                      return (
                        <AbilityCard
                          key={ability.id}
                          ability={ability}
                          purchased={purchased}
                          remainingMp={remainingMp}
                          onPurchase={handlePurchase}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  };

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
            Manage weapons and armor techniques, collapse groups you are not actively tuning.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label
            style={{
              background: "#0f1723",
              border: "1px solid #223447",
              borderRadius: 10,
              padding: "0.8rem 1rem",
              minWidth: 200,
              color: "#c5ccd9",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              boxShadow: "0 10px 28px rgba(0,0,0,0.25)"
            }}
          >
            <span style={{ fontSize: 13, letterSpacing: 0.2 }}>MP Pool</span>
            <input
              type="number"
              value={state.mpPool}
              onChange={(e) => updateMpPool(Number(e.target.value) || 0)}
              min={0}
              style={{
                background: "#0c121a",
                border: "1px solid #2b3747",
                borderRadius: 8,
                padding: "0.45rem 0.55rem",
                color: "#e6edf7",
                fontSize: 15,
                fontWeight: 600
              }}
            />
          </label>
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

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {renderSection("Weapon", "Weapons")}
        {renderSection("Armor", "Armor")}
      </div>
    </div>
  );
};
