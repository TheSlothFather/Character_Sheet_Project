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
        background: purchased ? "#24291f" : "#14181f",
        border: purchased ? "1px solid #7bc96f" : "1px solid #202a34",
        borderRadius: 10,
        padding: "0.75rem",
        color: "#e6edf7",
        cursor: purchased || !canAfford ? "not-allowed" : "pointer",
        opacity: purchased ? 1 : canAfford ? 1 : 0.7,
        transition: "border-color 0.2s ease",
        boxShadow: purchased ? "0 0 0 1px rgba(123,201,111,0.2)" : "none"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{ability.name}</div>
          <div style={{ fontSize: 12, color: "#9aa3b5" }}>{ability.abilityType}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {ability.twoHanded && (
            <span
              style={{
                background: "#1c1f26",
                border: "1px solid #2f3845",
                borderRadius: 6,
                padding: "0.2rem 0.5rem",
                fontSize: 12,
                color: "#f4b563"
              }}
            >
              Two-Handed
            </span>
          )}
          <span
            style={{
              background: "#0e141b",
              border: "1px solid #273442",
              borderRadius: 6,
              padding: "0.2rem 0.5rem",
              fontSize: 12,
              color: "#9ae6b4"
            }}
          >
            {ability.mpCost} MP
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 6, marginBottom: 8 }}>
        <StatPill label="Energy" value={ability.energyCost} />
        <StatPill label="Action Points" value={ability.actionPointCost} />
        <StatPill label="Damage" value={ability.damage} />
        <StatPill label="Type" value={ability.damageType} />
        <StatPill label="Range" value={ability.range} />
      </div>
      <div style={{ fontSize: 14, color: "#c5ccd9", marginBottom: 6 }}>{ability.description}</div>
      <div style={{ fontSize: 12, color: purchased ? "#9ae6b4" : "#c5ccd9" }}>{statusLabel}</div>
    </button>
  );
};

const StatPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      background: "#0f141d",
      border: "1px solid #1f2935",
      borderRadius: 8,
      padding: "0.35rem 0.5rem",
      display: "flex",
      flexDirection: "column",
      gap: 2
    }}
  >
    <span style={{ fontSize: 11, color: "#9aa3b5" }}>{label}</span>
    <span style={{ fontSize: 13, color: "#e6edf7" }}>{value}</span>
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

  const { selectedId } = useSelectedCharacter();
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacter, setLoadingCharacter] = React.useState(false);

  const storageKey = React.useMemo(() => (selectedId ? `${STORAGE_KEY}:${selectedId}` : null), [selectedId]);

  const [state, setState] = React.useState<MartialState>(() => loadPersistedState(storageKey, DEFAULT_MP_POOL, abilityIds));

  React.useEffect(() => {
    setState(loadPersistedState(storageKey, DEFAULT_MP_POOL, abilityIds));
  }, [abilityIds, storageKey]);

  React.useEffect(() => {
    persistState(storageKey, state);
  }, [state, storageKey]);

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
      <section key={kind} style={{ background: "#0f131a", border: "1px solid #1f2935", borderRadius: 12, padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0, color: "#e6edf7" }}>{title}</h2>
          <span style={{ color: "#9aa3b5", fontSize: 13 }}>{categories.size} categories</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
          {orderedCategories.map((category) => (
            <div key={category} style={{ border: "1px solid #1f2935", borderRadius: 10, padding: "0.75rem", background: "#0c1017" }}>
              <div style={{ fontWeight: 700, color: "#c5ccd9", marginBottom: 8 }}>{category}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {categories.get(category)?.map((ability) => {
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
            </div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Martial Prowess</h1>
          <p style={{ margin: "0.2rem 0", color: "#c5ccd9" }}>Character: {selectedCharacter.name}</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label
            style={{
              background: "#131a24",
              border: "1px solid #2b3747",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              minWidth: 180,
              color: "#c5ccd9",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}
          >
            <span style={{ fontSize: 13 }}>MP Pool</span>
            <input
              type="number"
              value={state.mpPool}
              onChange={(e) => updateMpPool(Number(e.target.value) || 0)}
              min={0}
              style={{
                background: "#0f141d",
                border: "1px solid #2b3747",
                borderRadius: 6,
                padding: "0.35rem 0.5rem",
                color: "#e6edf7"
              }}
            />
          </label>
          <div
            style={{
              background: "#131a24",
              border: "1px solid #2b3747",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              minWidth: 200,
              textAlign: "center"
            }}
          >
            <div style={{ fontSize: 13, color: "#9aa3b5" }}>MP Remaining</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#9ae6b4" }}>{remainingMp}</div>
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
