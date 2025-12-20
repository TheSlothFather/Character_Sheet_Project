import React from "react";
import { api, Character } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import facultiesText from "../../data/magic-faculties.txt?raw";
import { ParsedFaculty, parseMagicFaculties } from "./magicParser";
import { getAncillaryStorageKey, readAncillarySelection } from "../ancillaries/storage";
import "./MagicFacultiesPage.css";

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

const DetailBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="magic-faculties__detail">
    <h3 className="magic-faculties__detail-title">{title}</h3>
    {children}
  </div>
);

const TierPanel: React.FC<{ tier: { label: string; content: string }; defaultOpen?: boolean }> = ({ tier, defaultOpen }) => (
  <details open={defaultOpen} className="magic-faculties__tier">
    <summary className="magic-faculties__tier-summary">{tier.label}</summary>
    <div className="magic-faculties__tier-content">{tier.content || "No details provided."}</div>
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
  const buttonState = unlocked ? "unlocked" : canAfford ? "available" : "blocked";
  return (
  <div className="card stack magic-faculties__card">
    <div className="cluster magic-faculties__card-header">
        <div>
          <h2 className="magic-faculties__card-title">{faculty.name}</h2>
          <div className="magic-faculties__card-subtitle">
            {faculty.category} Faculty · {cost} Ildakar points to unlock
          </div>
        </div>
      <div className="cluster magic-faculties__card-actions">
          <span
            className={`magic-faculties__badge ${
              faculty.category === "Basic" ? "magic-faculties__badge--basic" : "magic-faculties__badge--advanced"
            }`}
          >
            {faculty.category}
          </span>
          <button
            onClick={onToggle}
            disabled={disabled || (!unlocked && !canAfford)}
            className={`btn magic-faculties__toggle magic-faculties__toggle--${buttonState}`}
            title={unlocked ? "Remove this Faculty" : canAfford ? "Unlock this Faculty" : "Not enough Ildakar points"}
          >
            {unlocked ? "Remove" : canAfford ? "Unlock" : "Insufficient"}
          </button>
        </div>
      </div>

      {faculty.intro && (
        <DetailBlock title="Overview">
          <div className="magic-faculties__body">{faculty.intro}</div>
        </DetailBlock>
      )}

      {faculty.tiers.length > 0 ? (
        <DetailBlock title="Tiers">
          {faculty.tiers.map((tier, idx) => (
            <TierPanel key={tier.label + idx} tier={tier} defaultOpen={idx === 0} />
          ))}
        </DetailBlock>
      ) : (
        <div className="magic-faculties__warning">
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
    <div className="page magic-faculties">
      <header className="page__header magic-faculties__header">
        <h1 className="magic-faculties__title h1">Magic Faculties</h1>
        <p className="magic-faculties__intro subtitle muted">
          Faculties are unlocked with Ildakar Faculty points. Basic Faculties cost {effectiveBasicCost} points and Advanced
          Faculties cost {COST_BY_CATEGORY.Advanced}. Aspect investments are additive across all six aspects.
        </p>
      </header>

      <main className="page__content">
        <div className="grid magic-faculties__summary">
          <div className="panel stack magic-faculties__panel">
            <h2 className="magic-faculties__panel-title h2">Ildakar Faculty Points</h2>
            {characterError && <div className="magic-faculties__error">{characterError}</div>}
            {loadingCharacters ? (
              <div className="magic-faculties__muted">Loading characters...</div>
            ) : selectedCharacter ? (
              <div className="magic-faculties__stats">
                <div className="magic-faculties__stat">
                  <div className="magic-faculties__stat-label">Available</div>
                  <div className="magic-faculties__stat-value">{availablePoints}</div>
                </div>
                <div className="magic-faculties__stat">
                  <div className="magic-faculties__stat-label">Spent</div>
                  <div className="magic-faculties__stat-value">{spentPoints}</div>
                </div>
                <div className="magic-faculties__stat">
                  <div className="magic-faculties__stat-label">Remaining</div>
                  <div
                    className={`magic-faculties__stat-value ${
                      remainingPoints < 0 ? "magic-faculties__stat-value--danger" : "magic-faculties__stat-value--success"
                    }`}
                  >
                    {remainingPoints}
                  </div>
                </div>
              </div>
            ) : (
              <div className="magic-faculties__muted">
                Select a character on the Characters page to sync their Ildakar Faculty points here.
              </div>
            )}
          </div>

          <div className="panel stack magic-faculties__panel">
            <h2 className="magic-faculties__panel-title h2">Aspect Cost Scaling</h2>
            <p className="magic-faculties__panel-text">
              AP and Energy costs are additive across all six aspects. Example: one Tier 2 aspect with five Tier 1 aspects costs
              14 AP/E; one Tier 3 with five Tier 1 costs 33 AP/E.
            </p>
            <table className="table magic-faculties__table">
              <thead>
                <tr className="table__row">
                  <th className="table__header magic-faculties__table-header">Tier</th>
                  <th className="table__header magic-faculties__table-header">AP & Energy Cost</th>
                </tr>
              </thead>
              <tbody>
                {ASPECT_COSTS.map((row) => (
                  <tr key={row.tier} className="table__row">
                    <td className="table__cell magic-faculties__table-cell">Tier {row.tier}</td>
                    <td className="table__cell magic-faculties__table-cell">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      <div className="grid magic-faculties__grid">
        <div className="panel stack magic-faculties__panel">
          <h2 className="magic-faculties__panel-title h2">Faculty Costs</h2>
          <p className="magic-faculties__panel-text">Spend Ildakar Faculty points to unlock a Faculty for the caster.</p>
          <ul className="magic-faculties__list">
            {basic.map((faculty) => (
              <li key={faculty.name}>{faculty.name} — {effectiveBasicCost} points</li>
            ))}
            {advanced.map((faculty) => (
              <li key={faculty.name}>{faculty.name} — {COST_BY_CATEGORY.Advanced} points</li>
            ))}
          </ul>
        </div>

        <div className="panel stack magic-faculties__panel">
          <h2 className="magic-faculties__panel-title h2">Aspect Scaling</h2>
          <div className="magic-faculties__table-scroll">
            <table className="table magic-faculties__table">
              <thead>
                <tr className="table__row">
                  <th className="table__header magic-faculties__table-header magic-faculties__table-header--spaced">Aspect</th>
                  {ASPECT_COSTS.map((row) => (
                    <th key={row.tier} className="table__header magic-faculties__table-header magic-faculties__table-header--spaced">
                      Tier {row.tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ASPECT_SCALE).map(([aspect, values]) => (
                  <tr key={aspect} className="table__row">
                    <td className="table__cell magic-faculties__table-cell magic-faculties__table-cell--strong">{aspect}</td>
                    {values.map((value, idx) => (
                      <td key={idx} className="table__cell magic-faculties__table-cell">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel stack magic-faculties__panel magic-faculties__panel--spaced">
        <h2 className="magic-faculties__panel-title h2">Aspect AP & Energy Calculator</h2>
        <p className="magic-faculties__panel-text">
          Choose a tier for each aspect to total the AP/Energy cost. Values add together exactly as described: six Tier 1 aspects
          cost {ASPECT_KEYS.length * getAspectCost(1)} AP/Energy; mixing tiers sums their respective costs.
        </p>
        <div className="grid magic-faculties__calculator">
          {ASPECT_KEYS.map((aspect) => (
            <label key={aspect} className="stack magic-faculties__field">
              <span className="magic-faculties__field-label">{aspect}</span>
              <select
                value={aspectTiers[aspect]}
                onChange={(e) =>
                  setAspectTiers((prev) => ({
                    ...prev,
                    [aspect]: Number(e.target.value)
                  }))
                }
                className="select magic-faculties__select"
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
        <div className="cluster magic-faculties__totals">
          <div className="magic-faculties__total">
            Total AP Cost: {adjustedApCost}
            {ancillaryEffects.apMultiplier !== 1 ? ` (base ${totalAspectCost})` : ""}
          </div>
          <div className="magic-faculties__total">
            Total Energy Cost: {adjustedEnergyCost}
            {ancillaryEffects.energyMultiplier !== 1 ? ` (base ${totalAspectCost})` : ""}
          </div>
        </div>
        {ancillaryEffects.modifiers.length > 0 && (
          <div className="magic-faculties__modifiers">
            <div className="magic-faculties__modifiers-title">Ancillary modifiers applied:</div>
            <ul className="magic-faculties__modifiers-list">
              {ancillaryEffects.modifiers.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid magic-faculties__cards">
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
      </main>
    </div>
  );
};
