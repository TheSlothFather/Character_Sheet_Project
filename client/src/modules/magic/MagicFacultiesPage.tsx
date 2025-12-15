import React from "react";
import { api, Character } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import facultiesText from "../../data/magic-faculties.txt?raw";
import { ParsedFaculty, parseMagicFaculties } from "./magicParser";
import { getAncillaryStorageKey, readAncillarySelection } from "../ancillaries/storage";

const normalizeName = (value: string): string => value.trim().toLowerCase();

const COST_BY_CATEGORY: Record<"Basic" | "Advanced", number> = {
  Basic: 30,
  Advanced: 60
};

const ASPECT_COSTS = [
  { tier: 1, cost: 1 },
  { tier: 2, cost: 9 },
  { tier: 3, cost: 27 },
  { tier: 4, cost: 57 },
  { tier: 5, cost: 99 },
  { tier: 6, cost: 153 }
];

const ASPECT_SCALE: Record<string, string[]> = {
  Intensity: ["Physical Mod x3", "Physical Mod x5", "Physical Mod x10", "Physical Mod x25", "Physical Mod x100", "Physical Mod x200"],
  Area: ["5 ft", "Physical Mod x5 ft", "Physical Mod x10 ft", "Physical Mod x100 ft", "Physical Mod x0.10 miles", "Physical Mod Miles"],
  Range: ["Physical Mod x5 ft", "Physical Mod x10 ft", "Physical Mod x100 ft", "Physical Mod Miles", "Physical Mod x10 Miles", "Physical Mod x100 Miles"],
  Duration: ["1 Round", "Physical Mod Rounds", "Physical Mod Minutes", "Physical Mod Hours", "Physical Mod Phases", "Physical Mod Cycles"],
  Origins: ["1", "2", "3", "4", "5", "6"],
  Compound: ["1", "2", "3", "4", "5", "6"]
};

const ASPECT_KEYS = Object.keys(ASPECT_SCALE);

const getAspectCost = (tier: number): number => ASPECT_COSTS.find((row) => row.tier === tier)?.cost ?? 0;

const cardStyle: React.CSSProperties = {
  background: "#1a202c",
  border: "1px solid #2d3748",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)"
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase"
};

const DetailBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: "1rem" }}>
    <h3 style={{ margin: "0 0 0.5rem 0", fontSize: 16, color: "#e2e8f0" }}>{title}</h3>
    {children}
  </div>
);

const TierPanel: React.FC<{ tier: { label: string; content: string }; defaultOpen?: boolean }> = ({ tier, defaultOpen }) => (
  <details open={defaultOpen} style={{ marginBottom: "0.5rem", background: "#111827", borderRadius: 6, border: "1px solid #2d3748", padding: "0.5rem 0.75rem" }}>
    <summary style={{ cursor: "pointer", fontWeight: 700, color: "#cbd5e0" }}>{tier.label}</summary>
    <div style={{ whiteSpace: "pre-line", marginTop: "0.5rem", color: "#e2e8f0" }}>{tier.content || "No details provided."}</div>
  </details>
);

const FacultyCard: React.FC<{
  faculty: ParsedFaculty;
  unlocked: boolean;
  onToggle: () => void;
  canAfford: boolean;
  disabled: boolean;
  cost: number;
}> = ({ faculty, unlocked, onToggle, canAfford, disabled, cost }) => {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: "#f7fafc" }}>{faculty.name}</h2>
          <div style={{ color: "#a0aec0", fontSize: 14 }}>
            {faculty.category} Faculty · {cost} Ildakar points to unlock
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              ...badgeStyle,
              background: faculty.category === "Basic" ? "#2f855a" : "#805ad5",
              color: "#f7fafc"
            }}
          >
            {faculty.category}
          </span>
          <button
            onClick={onToggle}
            disabled={disabled || (!unlocked && !canAfford)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #2d3748",
              background: unlocked ? "#2f855a" : canAfford ? "#1a365d" : "#3c2a2a",
              color: "#f7fafc",
              cursor: disabled || (!unlocked && !canAfford) ? "not-allowed" : "pointer",
              fontWeight: 700
            }}
            title={unlocked ? "Remove this Faculty" : canAfford ? "Unlock this Faculty" : "Not enough Ildakar points"}
          >
            {unlocked ? "Remove" : canAfford ? "Unlock" : "Insufficient"}
          </button>
        </div>
      </div>

      {faculty.intro && (
        <DetailBlock title="Overview">
          <div style={{ whiteSpace: "pre-line", color: "#e2e8f0" }}>{faculty.intro}</div>
        </DetailBlock>
      )}

      {faculty.tiers.length > 0 ? (
        <DetailBlock title="Tiers">
          {faculty.tiers.map((tier, idx) => (
            <TierPanel key={tier.label + idx} tier={tier} defaultOpen={idx === 0} />
          ))}
        </DetailBlock>
      ) : (
        <div style={{ color: "#e53e3e", fontSize: 14, marginTop: "0.75rem" }}>
          No tier details were found for this faculty in the uploaded text.
        </div>
      )}
    </div>
  );
};

export const MagicFacultiesPage: React.FC = () => {
  const parsed = React.useMemo(() => parseMagicFaculties(facultiesText), []);
  const basic = parsed.filter((faculty) => faculty.category === "Basic");
  const advanced = parsed.filter((faculty) => faculty.category === "Advanced");
  const { selectedId } = useSelectedCharacter();
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacters, setLoadingCharacters] = React.useState<boolean>(true);
  const [unlocked, setUnlocked] = React.useState<Record<string, boolean>>({});
  const [unlockedLoaded, setUnlockedLoaded] = React.useState(false);
  const [selectedAncillaries, setSelectedAncillaries] = React.useState<Set<string>>(new Set());
  const [aspectTiers, setAspectTiers] = React.useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ASPECT_KEYS.forEach((key) => {
      initial[key] = 1;
    });
    return initial;
  });

  React.useEffect(() => {
    let mounted = true;
    setCharacterError(null);
    setLoadingCharacters(true);
    api
      .listCharacters()
      .then((list) => {
        if (!mounted) return;
        setCharacters(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setCharacterError(message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingCharacters(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const facultyStorageKey = React.useMemo(() => `unlocked_faculties_${selectedId ?? "unassigned"}`, [selectedId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(facultyStorageKey);
    if (stored) {
      try {
        const parsedStorage = JSON.parse(stored) as Record<string, boolean>;
        const normalized: Record<string, boolean> = {};
        parsed.forEach((faculty) => {
          const key = normalizeName(faculty.name);
          const matchingValue = parsedStorage[key] ?? parsedStorage[faculty.name];
          if (matchingValue) normalized[faculty.name] = true;
        });
        setUnlocked(normalized);
      } catch {
        setUnlocked({});
      }
    } else {
      setUnlocked({});
    }
    setUnlockedLoaded(true);
  }, [facultyStorageKey, parsed]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !unlockedLoaded) return;
    const payload: Record<string, boolean> = {};
    Object.entries(unlocked).forEach(([name, value]) => {
      if (!value) return;
      payload[name] = true;
      payload[normalizeName(name)] = true;
    });
    window.localStorage.setItem(facultyStorageKey, JSON.stringify(payload));
  }, [facultyStorageKey, unlocked, unlockedLoaded]);

  React.useEffect(() => {
    const read = () => {
      const stored = readAncillarySelection(selectedId).selected;
      setSelectedAncillaries(new Set(stored));
    };

    read();

    const handler = (event: StorageEvent) => {
      if (event.key === getAncillaryStorageKey(selectedId)) read();
    };

    if (typeof window !== "undefined") window.addEventListener("storage", handler);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("storage", handler);
    };
  }, [selectedId]);

  const selectedCharacter = React.useMemo(
    () => characters.find((c) => c.id === selectedId),
    [characters, selectedId]
  );

  const availablePoints = selectedCharacter?.skillAllocations?.ILDAKAR_FACULTY ?? 0;

  const ancillaryEffects = React.useMemo(() => {
    let basicCostMultiplier = 1;
    let apMultiplier = 1;
    let energyMultiplier = 1;
    const modifiers: string[] = [];

    if (selectedAncillaries.has("ildakar-prodigy")) {
      basicCostMultiplier *= 0.5;
      modifiers.push("Basic Faculty unlock cost -50% (Ildakar Prodigy)");
    }

    const applyBoth = (label: string) => {
      apMultiplier *= 0.8;
      energyMultiplier *= 0.8;
      modifiers.push(`${label}: -20% AP & Energy`);
    };

    if (selectedAncillaries.has("ildakar-acolyte")) applyBoth("Ildakar Acolyte");
    if (selectedAncillaries.has("ildakar-understudy")) applyBoth("Ildakar Understudy");
    if (selectedAncillaries.has("ildakar-theurgist")) applyBoth("Ildakar Theurgist");
    if (selectedAncillaries.has("quickcaster")) {
      apMultiplier *= 0.8;
      modifiers.push("Quickcaster: -20% AP");
    }

    if (selectedAncillaries.has("well-of-dakar")) {
      energyMultiplier *= 0.8;
      modifiers.push("Well of Dakar: -20% Energy cost");
    }

    return {
      basicCostMultiplier,
      apMultiplier,
      energyMultiplier,
      modifiers
    };
  }, [selectedAncillaries]);

  const getFacultyCost = React.useCallback(
    (faculty: ParsedFaculty) => {
      const baseCost = COST_BY_CATEGORY[faculty.category];
      if (faculty.category === "Basic") return Math.ceil(baseCost * ancillaryEffects.basicCostMultiplier);
      return baseCost;
    },
    [ancillaryEffects.basicCostMultiplier]
  );

  const spentPoints = React.useMemo(
    () => parsed.reduce((acc, faculty) => (unlocked[faculty.name] ? acc + getFacultyCost(faculty) : acc), 0),
    [getFacultyCost, parsed, unlocked]
  );

  const remainingPoints = Math.max(0, availablePoints - spentPoints);

  const toggleUnlocked = (faculty: ParsedFaculty) => {
    const cost = getFacultyCost(faculty);
    if (!unlocked[faculty.name] && remainingPoints < cost) return;
    setUnlocked((prev) => ({ ...prev, [faculty.name]: !prev[faculty.name] }));
  };

  const totalAspectCost = React.useMemo(
    () => ASPECT_KEYS.reduce((sum, key) => sum + getAspectCost(aspectTiers[key]), 0),
    [aspectTiers]
  );

  const adjustedApCost = Math.round(totalAspectCost * ancillaryEffects.apMultiplier);
  const adjustedEnergyCost = Math.round(totalAspectCost * ancillaryEffects.energyMultiplier);
  const effectiveBasicCost = Math.ceil(COST_BY_CATEGORY.Basic * ancillaryEffects.basicCostMultiplier);

  return (
    <div style={{ color: "#e2e8f0" }}>
      <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Magic Faculties</h1>
      <p style={{ marginTop: 0, color: "#cbd5e0" }}>
        Faculties are unlocked with Ildakar Faculty points. Basic Faculties cost {effectiveBasicCost} points and Advanced
        Faculties cost {COST_BY_CATEGORY.Advanced}. Aspect investments are additive across all six aspects.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 0.5rem 0" }}>Ildakar Faculty Points</h2>
          {characterError && <div style={{ color: "#f56565", marginBottom: 8 }}>{characterError}</div>}
          {loadingCharacters ? (
            <div style={{ color: "#cbd5e0" }}>Loading characters...</div>
          ) : selectedCharacter ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              <div style={{ ...badgeStyle, background: "#1f2937", color: "#e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: 12, textTransform: "none" }}>Available</div>
                <div style={{ fontSize: 18 }}>{availablePoints}</div>
              </div>
              <div style={{ ...badgeStyle, background: "#1f2937", color: "#e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: 12, textTransform: "none" }}>Spent</div>
                <div style={{ fontSize: 18 }}>{spentPoints}</div>
              </div>
              <div style={{ ...badgeStyle, background: "#1f2937", color: "#e2e8f0", textAlign: "center" }}>
                <div style={{ fontSize: 12, textTransform: "none" }}>Remaining</div>
                <div style={{ fontSize: 18, color: remainingPoints < 0 ? "#f56565" : "#9ae6b4" }}>{remainingPoints}</div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#cbd5e0" }}>
              Select a character on the Characters page to sync their Ildakar Faculty points here.
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Aspect Cost Scaling</h2>
          <p style={{ margin: 0, color: "#cbd5e0" }}>
            AP and Energy costs are additive across all six aspects. Example: one Tier 2 aspect with five Tier 1 aspects costs
            14 AP/E; one Tier 3 with five Tier 1 costs 33 AP/E.
          </p>
          <table style={{ width: "100%", marginTop: "0.75rem", borderCollapse: "collapse", color: "#e2e8f0" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #2d3748", paddingBottom: 4 }}>Tier</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #2d3748", paddingBottom: 4 }}>AP & Energy Cost</th>
              </tr>
            </thead>
            <tbody>
              {ASPECT_COSTS.map((row) => (
                <tr key={row.tier}>
                  <td style={{ padding: "4px 0" }}>Tier {row.tier}</td>
                  <td style={{ padding: "4px 0" }}>{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Faculty Costs</h2>
          <p style={{ margin: 0, color: "#cbd5e0" }}>Spend Ildakar Faculty points to unlock a Faculty for the caster.</p>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem", color: "#e2e8f0" }}>
            {basic.map((faculty) => (
              <li key={faculty.name}>{faculty.name} — {effectiveBasicCost} points</li>
            ))}
            {advanced.map((faculty) => (
              <li key={faculty.name}>{faculty.name} — {COST_BY_CATEGORY.Advanced} points</li>
            ))}
          </ul>
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Aspect Scaling</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #2d3748", padding: "6px 4px" }}>Aspect</th>
                  {ASPECT_COSTS.map((row) => (
                    <th key={row.tier} style={{ textAlign: "left", borderBottom: "1px solid #2d3748", padding: "6px 4px" }}>
                      Tier {row.tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ASPECT_SCALE).map(([aspect, values]) => (
                  <tr key={aspect}>
                    <td style={{ padding: "6px 4px", fontWeight: 700 }}>{aspect}</td>
                    {values.map((value, idx) => (
                      <td key={idx} style={{ padding: "6px 4px" }}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Aspect AP & Energy Calculator</h2>
        <p style={{ margin: 0, color: "#cbd5e0" }}>
          Choose a tier for each aspect to total the AP/Energy cost. Values add together exactly as described: six Tier 1 aspects
          cost {ASPECT_KEYS.length * getAspectCost(1)} AP/Energy; mixing tiers sums their respective costs.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", marginTop: "0.75rem" }}>
          {ASPECT_KEYS.map((aspect) => (
            <label key={aspect} style={{ display: "flex", flexDirection: "column", gap: 4, color: "#e2e8f0" }}>
              <span style={{ fontWeight: 700 }}>{aspect}</span>
              <select
                value={aspectTiers[aspect]}
                onChange={(e) =>
                  setAspectTiers((prev) => ({
                    ...prev,
                    [aspect]: Number(e.target.value)
                  }))
                }
                style={{ padding: "0.35rem 0.5rem", borderRadius: 6, background: "#0b1019", color: "#e2e8f0", border: "1px solid #2d3748" }}
              >
                {ASPECT_COSTS.map((row) => (
                  <option key={row.tier} value={row.tier}>
                    Tier {row.tier} — Cost {row.cost}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ ...badgeStyle, background: "#1f2937", color: "#e2e8f0" }}>
            Total AP Cost: {adjustedApCost}
            {ancillaryEffects.apMultiplier !== 1 ? ` (base ${totalAspectCost})` : ""}
          </div>
          <div style={{ ...badgeStyle, background: "#1f2937", color: "#e2e8f0" }}>
            Total Energy Cost: {adjustedEnergyCost}
            {ancillaryEffects.energyMultiplier !== 1 ? ` (base ${totalAspectCost})` : ""}
          </div>
        </div>
        {ancillaryEffects.modifiers.length > 0 && (
          <div style={{ marginTop: "0.5rem", color: "#a0aec0", fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ancillary modifiers applied:</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {ancillaryEffects.modifiers.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
        {parsed.map((faculty) => {
          const cost = getFacultyCost(faculty);
          const canAfford = remainingPoints >= cost || unlocked[faculty.name];
          const disabled = loadingCharacters || !selectedCharacter;
          return (
            <FacultyCard
              key={faculty.name}
              faculty={faculty}
              cost={cost}
              unlocked={!!unlocked[faculty.name]}
              onToggle={() => toggleUnlocked(faculty)}
              canAfford={canAfford}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  );
};
