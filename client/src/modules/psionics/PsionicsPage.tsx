import React from "react";
import { api, Character } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import psionicsCsv from "../../data/psionics.csv?raw";
import {
  DEFAULT_PSI_POINTS,
  PsionicAbility,
  evaluateFormula,
  isAbilityUnlocked,
  parsePsionicsCsv,
  replaceMentalAttributePlaceholders
} from "./psionicsUtils";

interface PsiState {
  psiPool: number;
  purchased: Set<string>;
  mental: number;
}

const STORAGE_KEY = "psionics_skill_tree_v1";
const DEFAULT_MENTAL_ATTRIBUTE = 3;

const loadPersistedState = (
  storageKey: string | null,
  defaultPsi: number,
  defaultMental: number,
  abilityIds: Set<string>
): PsiState => {
  if (typeof window === "undefined" || !storageKey) {
    return { psiPool: defaultPsi, purchased: new Set(), mental: defaultMental };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { psiPool: defaultPsi, purchased: new Set(), mental: defaultMental };
    const parsed = JSON.parse(raw) as { psiPool?: number; purchased?: string[]; mental?: number };
    const psiPool = typeof parsed.psiPool === "number" && parsed.psiPool >= 0 ? parsed.psiPool : defaultPsi;
    const mental = typeof parsed.mental === "number" && parsed.mental >= 0 ? parsed.mental : defaultMental;
    const purchased = Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((id) => abilityIds.has(id))
      : [];
    return { psiPool, mental, purchased: new Set(purchased) };
  } catch (err) {
    console.warn("Unable to parse psionics state", err);
    return { psiPool: defaultPsi, purchased: new Set(), mental: defaultMental };
  }
};

const persistState = (storageKey: string | null, state: PsiState) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const payload = JSON.stringify({
      psiPool: state.psiPool,
      mental: state.mental,
      purchased: Array.from(state.purchased)
    });
    window.localStorage.setItem(storageKey, payload);
  } catch (err) {
    console.warn("Unable to persist psionics state", err);
  }
};

const AbilityCard: React.FC<{
  ability: PsionicAbility;
  purchased: boolean;
  unlocked: boolean;
  remainingPsi: number;
  mentalStat: number;
  onPurchase: (ability: PsionicAbility) => void;
}> = ({ ability, purchased, unlocked, remainingPsi, mentalStat, onPurchase }) => {
  const derived = ability.formula ? evaluateFormula(ability.formula, mentalStat) : null;
  const psiCost = ability.tier;
  const canAfford = remainingPsi >= psiCost;
  const statusLabel = purchased ? "Purchased" : unlocked ? (canAfford ? "Unlocked" : "Insufficient Psi") : "Locked";
  const formattedDescription = replaceMentalAttributePlaceholders(ability.description, mentalStat);

  return (
    <button
      onClick={() => onPurchase(ability)}
      disabled={!unlocked || purchased || !canAfford}
      style={{
        width: "100%",
        textAlign: "left",
        background: purchased ? "#21312b" : unlocked ? "#18202c" : "#11141a",
        border: purchased ? "1px solid #3ca66a" : unlocked ? "1px solid #2d3c4e" : "1px solid #222",
        borderRadius: 10,
        padding: "0.75rem",
        color: "#e6edf7",
        cursor: unlocked && !purchased && canAfford ? "pointer" : "not-allowed",
        opacity: unlocked ? 1 : 0.6,
        transition: "border-color 0.2s ease",
        boxShadow: purchased ? "0 0 0 1px rgba(60,166,106,0.2)" : "none"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700 }}>{ability.name}</div>
          <div style={{ fontSize: 12, color: "#9aa3b5" }}>Tier {ability.tier}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              background: "#0e141b",
              border: "1px solid #273442",
              borderRadius: 6,
              padding: "0.2rem 0.5rem",
              fontSize: 12,
              color: "#9ae6b4"
            }}
          >
            {psiCost} Psi
          </div>
          <div
            style={{
              background: "#121926",
              border: "1px solid #2b3747",
              borderRadius: 6,
              padding: "0.2rem 0.5rem",
              fontSize: 12,
              color: "#c5ccd9"
            }}
          >
            Energy: {ability.energyCost}
          </div>
        </div>
      </div>
      <p style={{ margin: "0 0 0.5rem", fontSize: 14, lineHeight: 1.4 }}>{formattedDescription}</p>
      <div style={{ fontSize: 13, color: "#c5ccd9", marginBottom: 4 }}>
        <strong>Prerequisites:</strong> {ability.prerequisiteNames.length ? ability.prerequisiteNames.join(", ") : "None"}
      </div>
      {ability.formula && (
        <div style={{ fontSize: 13, color: "#c5ccd9", marginBottom: 4 }}>
          <strong>Formula:</strong> {ability.formula.replace(/\*/g, " × ")}
          {derived !== null && ` = ${derived}`}
        </div>
      )}
      <div style={{ fontSize: 12, color: purchased ? "#9ae6b4" : unlocked ? "#c5ccd9" : "#77808f" }}>{statusLabel}</div>
    </button>
  );
};

export const PsionicsPage: React.FC = () => {
  const abilities = React.useMemo(() => parsePsionicsCsv(psionicsCsv), []);
  const abilityIds = React.useMemo(() => new Set(abilities.map((a) => a.id)), [abilities]);
  const abilityCostMap = React.useMemo(() => new Map(abilities.map((a) => [a.id, a.tier])), [abilities]);

  const { selectedId } = useSelectedCharacter();
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacter, setLoadingCharacter] = React.useState(false);

  const storageKey = React.useMemo(() => (selectedId ? `${STORAGE_KEY}:${selectedId}` : null), [selectedId]);

  const [state, setState] = React.useState<PsiState>(() =>
    loadPersistedState(storageKey, DEFAULT_PSI_POINTS, DEFAULT_MENTAL_ATTRIBUTE, abilityIds)
  );

  React.useEffect(() => {
    setState(loadPersistedState(storageKey, DEFAULT_PSI_POINTS, DEFAULT_MENTAL_ATTRIBUTE, abilityIds));
  }, [abilityIds, storageKey]);

  React.useEffect(() => {
    persistState(storageKey, state);
  }, [state, storageKey]);

  React.useEffect(() => {
    setSelectedCharacter(null);
    if (!selectedId) {
      setCharacterError("Select a character on the Characters page to manage psionics.");
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

  const spentPsi = React.useMemo(
    () => Array.from(state.purchased).reduce((sum, id) => sum + (abilityCostMap.get(id) ?? 0), 0),
    [abilityCostMap, state.purchased]
  );

  const remainingPsi = Math.max(0, state.psiPool - spentPsi);

  const trees = React.useMemo(() => {
    const map = new Map<string, Map<number, PsionicAbility[]>>();

    for (const ability of abilities) {
      if (!map.has(ability.tree)) {
        map.set(ability.tree, new Map());
      }
      const tierMap = map.get(ability.tree)!;
      if (!tierMap.has(ability.tier)) {
        tierMap.set(ability.tier, []);
      }
      tierMap.get(ability.tier)!.push(ability);
    }

    for (const tierMap of map.values()) {
      for (const abilityList of tierMap.values()) {
        abilityList.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return map;
  }, [abilities]);

  const handlePurchase = (ability: PsionicAbility) => {
    setState((prev) => {
      if (prev.purchased.has(ability.id)) return prev;
      if (!isAbilityUnlocked(ability, prev.purchased)) return prev;
      const psiCost = ability.tier;
      const spent = Array.from(prev.purchased).reduce((sum, id) => sum + (abilityCostMap.get(id) ?? 0), 0);
      const available = prev.psiPool - spent;
      if (available < psiCost) return prev;

      const nextPurchased = new Set(prev.purchased);
      nextPurchased.add(ability.id);
      return { ...prev, purchased: nextPurchased };
    });
  };

  const updatePsiPool = (value: number) => {
    setState((prev) => ({ ...prev, psiPool: Math.max(0, value) }));
  };

  const updateMental = (value: number) => {
    setState((prev) => ({ ...prev, mental: Math.max(0, value) }));
  };

  if (!selectedId) {
    return <p>Please select a character on the Characters page to view psionics.</p>;
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Psionics</h1>
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
            <span style={{ fontSize: 13 }}>Psi Pool</span>
            <input
              type="number"
              value={state.psiPool}
              onChange={(e) => updatePsiPool(Number(e.target.value) || 0)}
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
            <span style={{ fontSize: 13 }}>Mental Attribute</span>
            <input
              type="number"
              value={state.mental}
              onChange={(e) => updateMental(Number(e.target.value) || 0)}
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
            <div style={{ fontSize: 13, color: "#9aa3b5" }}>Psi Points Remaining</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#9ae6b4" }}>{remainingPsi}</div>
          </div>
        </div>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {Array.from(trees.entries()).map(([treeName, tiers]) => {
          const orderedTiers = Array.from(tiers.keys()).sort((a, b) => a - b);
          return (
            <section key={treeName} style={{ background: "#0f131a", border: "1px solid #1f2935", borderRadius: 12, padding: "1rem" }}>
              <h2 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#e6edf7" }}>{treeName}</h2>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${orderedTiers.length}, minmax(0, 1fr))`, gap: "1rem" }}>
                {orderedTiers.map((tier) => (
                  <div key={tier} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#9aa3b5",
                        borderBottom: "1px solid #1f2935",
                        paddingBottom: 6,
                        marginBottom: 4
                      }}
                    >
                      Tier {tier}
                    </div>
                    {tiers.get(tier)?.map((ability) => {
                      const unlocked = isAbilityUnlocked(ability, state.purchased);
                      const purchased = state.purchased.has(ability.id);
                      return (
                        <AbilityCard
                          key={ability.id}
                          ability={ability}
                          purchased={purchased}
                          unlocked={unlocked}
                          remainingPsi={remainingPsi}
                          mentalStat={state.mental}
                          onPurchase={handlePurchase}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
