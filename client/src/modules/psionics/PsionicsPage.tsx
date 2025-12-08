import React from "react";
import psionicsCsv from "../../data/psionics.csv?raw";
import {
  DEFAULT_PSI_POINTS,
  PsionicAbility,
  evaluateFormula,
  isAbilityUnlocked,
  parsePsionicsCsv
} from "./psionicsUtils";

interface PsiState {
  remaining: number;
  purchased: Set<string>;
}

const STORAGE_KEY = "psionics_skill_tree_v1";
const mentalStat = 3;

const loadPersistedState = (storageKey: string, defaultPsi: number, abilityIds: Set<string>): PsiState => {
  if (typeof window === "undefined") {
    return { remaining: defaultPsi, purchased: new Set() };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { remaining: defaultPsi, purchased: new Set() };
    const parsed = JSON.parse(raw) as { remaining?: number; purchased?: string[] };
    const remaining = typeof parsed.remaining === "number" && parsed.remaining >= 0 ? parsed.remaining : defaultPsi;
    const purchased = Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((id) => abilityIds.has(id))
      : [];
    return { remaining, purchased: new Set(purchased) };
  } catch (err) {
    console.warn("Unable to parse psionics state", err);
    return { remaining: defaultPsi, purchased: new Set() };
  }
};

const persistState = (storageKey: string, state: PsiState) => {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ remaining: state.remaining, purchased: Array.from(state.purchased) });
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
  onPurchase: (ability: PsionicAbility) => void;
}> = ({ ability, purchased, unlocked, remainingPsi, onPurchase }) => {
  const derived = ability.formula ? evaluateFormula(ability.formula, mentalStat) : null;
  const canAfford = remainingPsi >= ability.energyCost;
  const statusLabel = purchased ? "Purchased" : unlocked ? (canAfford ? "Unlocked" : "Insufficient Psi") : "Locked";

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
        <div style={{
          background: "#0e141b",
          border: "1px solid #273442",
          borderRadius: 6,
          padding: "0.2rem 0.5rem",
          fontSize: 12,
          color: "#9ae6b4"
        }}>
          {ability.energyCost} Psi
        </div>
      </div>
      <p style={{ margin: "0 0 0.5rem", fontSize: 14, lineHeight: 1.4 }}>{ability.description}</p>
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

  const [state, setState] = React.useState<PsiState>(() =>
    loadPersistedState(STORAGE_KEY, DEFAULT_PSI_POINTS, abilityIds)
  );

  React.useEffect(() => {
    persistState(STORAGE_KEY, state);
  }, [state]);

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
      if (prev.remaining < ability.energyCost) return prev;

      const nextPurchased = new Set(prev.purchased);
      nextPurchased.add(ability.id);
      return { remaining: prev.remaining - ability.energyCost, purchased: nextPurchased };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Psionics</h1>
          <p style={{ margin: "0.2rem 0", color: "#c5ccd9" }}>Mental attribute: {mentalStat}</p>
        </div>
        <div
          style={{
            background: "#131a24",
            border: "1px solid #2b3747",
            borderRadius: 10,
            padding: "0.75rem 1rem",
            minWidth: 180,
            textAlign: "center"
          }}
        >
          <div style={{ fontSize: 13, color: "#9aa3b5" }}>Psi Points Remaining</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#9ae6b4" }}>{state.remaining}</div>
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
                          remainingPsi={state.remaining}
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
