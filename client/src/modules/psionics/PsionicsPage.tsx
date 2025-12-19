import React from "react";
import { api, Character, RaceDetailProfile } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import { useDefinitions } from "../definitions/DefinitionsContext";
import {
  DEFAULT_PSI_POINTS,
  PsionicAbility,
  evaluateFormula,
  isAbilityUnlocked,
  parsePsionicsRows,
  replaceMentalAttributePlaceholders
} from "./psionicsUtils";
import { PSION_BACKGROUND_CONFIG, PSIONICS_STORAGE_KEY } from "./psionBackgrounds";
import { AncillarySelectionState, getAncillaryStorageKey, persistAncillarySelection, readAncillarySelection } from "../ancillaries/storage";

interface PsiState {
  purchased: Set<string>;
  backgroundPicks: Set<string>;
  ancillaryPicks: Record<string, string[]>;
  lockedAncillaries: Set<string>;
}

type LineSegment = {
  fromId: string;
  toId: string;
};

type PositionedLine = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

type TreeOverride = {
  tierOrder?: Record<number, string[]>;
  extraEdges?: Array<{ from: string; to: string }>;
  blockedEdges?: Array<{ from: string; to: string }>;
};

type PositionedNode = {
  ability: PsionicAbility;
  x: number;
  y: number;
};

const loadPersistedState = (storageKey: string | null, abilityIds: Set<string>): PsiState => {
  if (typeof window === "undefined" || !storageKey) {
    return { purchased: new Set(), backgroundPicks: new Set(), ancillaryPicks: {}, lockedAncillaries: new Set() };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { purchased: new Set(), backgroundPicks: new Set(), ancillaryPicks: {}, lockedAncillaries: new Set() };
    }
    const parsed = JSON.parse(raw) as {
      purchased?: string[];
      backgroundPicks?: string[];
      ancillaryPicks?: Record<string, string[]>;
      lockedAncillaries?: string[];
    };
    const purchased = Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((id) => abilityIds.has(id))
      : [];
    const backgroundPicks = Array.isArray(parsed.backgroundPicks)
      ? parsed.backgroundPicks.filter((id) => abilityIds.has(id))
      : [];
    const ancillaryPicks: Record<string, string[]> = {};
    Object.entries(parsed.ancillaryPicks ?? {}).forEach(([key, value]) => {
      const filtered = Array.isArray(value) ? value.filter((id) => abilityIds.has(id)) : [];
      if (filtered.length > 0) ancillaryPicks[key] = filtered;
    });

    const lockedAncillaries = Array.isArray(parsed.lockedAncillaries)
      ? parsed.lockedAncillaries.filter((id) => PSION_ANCILLARY_IDS.has(id))
      : [];

    return {
      purchased: new Set(purchased),
      backgroundPicks: new Set(backgroundPicks),
      ancillaryPicks,
      lockedAncillaries: new Set(lockedAncillaries)
    };
  } catch (err) {
    console.warn("Unable to parse psionics state", err);
    return { purchased: new Set(), backgroundPicks: new Set(), ancillaryPicks: {}, lockedAncillaries: new Set() };
  }
};

const persistState = (storageKey: string | null, state: PsiState) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const payload = JSON.stringify({
      purchased: Array.from(state.purchased),
      backgroundPicks: Array.from(state.backgroundPicks),
      ancillaryPicks: state.ancillaryPicks,
      lockedAncillaries: Array.from(state.lockedAncillaries)
    });
    window.localStorage.setItem(storageKey, payload);
  } catch (err) {
    console.warn("Unable to persist psionics state", err);
  }
};

const groupAbilitiesByTier = (abilities: PsionicAbility[], override?: TreeOverride) => {
  const tiers = new Map<number, PsionicAbility[]>();

  for (const ability of abilities) {
    if (!tiers.has(ability.tier)) tiers.set(ability.tier, []);
    tiers.get(ability.tier)!.push(ability);
  }

  for (const [tier, list] of tiers.entries()) {
    const orderedNames = override?.tierOrder?.[tier];
    if (orderedNames?.length) {
      const ordered: PsionicAbility[] = [];
      orderedNames.forEach((name) => {
        const found = list.find((ability) => ability.name === name);
        if (found) ordered.push(found);
      });
      list
        .filter((ability) => !ordered.includes(ability))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((remaining) => ordered.push(remaining));
      tiers.set(tier, ordered);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
      tiers.set(tier, list);
    }
  }

  return tiers;
};

const buildLineSegments = (
  abilities: PsionicAbility[],
  abilityById: Map<string, PsionicAbility>,
  abilityByName: Map<string, PsionicAbility>,
  override?: TreeOverride
): LineSegment[] => {
  const blocked = new Set<string>();
  override?.blockedEdges?.forEach(({ from, to }) => blocked.add(`${from}->${to}`));
  const lines: LineSegment[] = [];

  for (const ability of abilities) {
    ability.prerequisiteIds.forEach((prereqId) => {
      const prereqAbility = abilityById.get(prereqId);
      if (!prereqAbility) return;
      const key = `${prereqAbility.name}->${ability.name}`;
      if (blocked.has(key)) return;
      lines.push({ fromId: prereqAbility.id, toId: ability.id });
    });
  }

  override?.extraEdges?.forEach(({ from, to }) => {
    const fromAbility = abilityByName.get(from);
    const toAbility = abilityByName.get(to);
    if (!fromAbility || !toAbility) return;
    lines.push({ fromId: fromAbility.id, toId: toAbility.id });
  });

  return lines;
};

const TREE_OVERRIDES: Record<string, TreeOverride> = {
  Telepathy: {
    tierOrder: {
      2: ["Pry", "Sense Presence", "Interfere", "Interconnect", "Communicate"],
      3: ["Higher Conscious", "Read Memory", "Interlink"],
      4: ["Read Genome"],
      5: ["Read Link"]
    },
    extraEdges: [
      { from: "Telepathy", to: "Interconnect" },
      { from: "Read Memory", to: "Read Genome" },
      { from: "Read Genome", to: "Read Link" }
    ],
    blockedEdges: [
      { from: "Read Memory", to: "Read Link" },
      { from: "Read Link", to: "Read Genome" }
    ]
  }
};

const PSION_ANCILLARY_CONFIG: Record<
  string,
  { tier: number; grantsManifoldBonus?: boolean; energyCostOverride?: number }
> = {
  "fledgling-psion": { tier: 1, grantsManifoldBonus: true },
  "advanced-psion": { tier: 2, energyCostOverride: 1 },
  "heroic-psion": { tier: 3, energyCostOverride: 1 },
  "epic-psion": { tier: 4, energyCostOverride: 1 },
  "legendary-psion": { tier: 5, energyCostOverride: 1 },
  "mythic-psion": { tier: 5, energyCostOverride: 1 }
};

const PSION_ANCILLARY_ORDER = [
  "fledgling-psion",
  "advanced-psion",
  "heroic-psion",
  "epic-psion",
  "legendary-psion",
  "mythic-psion"
];

const PSION_ANCILLARY_IDS = new Set(Object.keys(PSION_ANCILLARY_CONFIG));
const PSION_ANCILLARY_LABELS: Record<string, string> = {
  "fledgling-psion": "Fledgling Psion",
  "advanced-psion": "Advanced Psion",
  "heroic-psion": "Heroic Psion",
  "epic-psion": "Epic Psion",
  "legendary-psion": "Legendary Psion",
  "mythic-psion": "Mythic Psion"
};

const AbilityNode: React.FC<{
  ability: PsionicAbility;
  purchased: boolean;
  unlocked: boolean;
  isStarter: boolean;
  remainingPsi: number;
  canSpend: boolean;
  spendLockReason: string;
  onPurchase: (ability: PsionicAbility) => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
}> = ({ ability, purchased, unlocked, isStarter, remainingPsi, canSpend, spendLockReason, onPurchase, buttonRef }) => {
  const psiCost = ability.tier;
  const canAfford = remainingPsi >= psiCost;
  const spendLocked = !canSpend && (unlocked || isStarter);
  const status = purchased
    ? "purchased"
    : spendLocked
      ? "locked-window"
      : unlocked
        ? canAfford
          ? "available"
          : "locked-cost"
        : isStarter
          ? canAfford
            ? "starter"
            : "starter-cost"
          : "locked";

  const colors: Record<string, { bg: string; border: string; text: string }> = {
    purchased: { bg: "#1f352a", border: "#3ca66a", text: "#b5f5c8" },
    available: { bg: "#18202c", border: "#3b82f6", text: "#dce7ff" },
    starter: { bg: "#1f1631", border: "#a855f7", text: "#e9d5ff" },
    "starter-cost": { bg: "#181027", border: "#6b21a8", text: "#c7b5ec" },
    "locked-cost": { bg: "#141924", border: "#334155", text: "#9aa3b5" },
    "locked-window": { bg: "#14161f", border: "#9a3412", text: "#f7a046" },
    locked: { bg: "#0f141d", border: "#1f2935", text: "#6b7280" }
  };

  const palette = colors[status];
  const disabled = purchased || (!unlocked && !isStarter) || !canAfford || spendLocked;

  return (
    <button
      ref={buttonRef}
      onClick={() => onPurchase(ability)}
      disabled={disabled}
      title={
        purchased
          ? "Already purchased"
          : spendLocked
            ? spendLockReason
            : unlocked
              ? canAfford
                ? "Purchase ability"
                : "Not enough Psi"
              : isStarter
                ? "Spend Psi to unlock this tree"
                : "Locked"
      }
      style={{
        minWidth: 108,
        minHeight: 48,
        padding: "0.5rem 0.65rem",
        borderRadius: 999,
        border: `2px solid ${palette.border}`,
        background: palette.bg,
        color: palette.text,
        fontWeight: 700,
        fontSize: 13,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "transform 0.1s ease, box-shadow 0.1s ease",
        boxShadow: purchased ? "0 0 0 2px rgba(60,166,106,0.2)" : "none"
      }}
    >
      <div style={{ lineHeight: 1.2 }}>{ability.name}</div>
      <div style={{ fontSize: 11, opacity: 0.8 }}>Tier {ability.tier}</div>
    </button>
  );
};

const SkillTree: React.FC<{
  treeName: string;
  tiers: Map<number, PsionicAbility[]>;
  lines: LineSegment[];
  purchased: Set<string>;
  remainingPsi: number;
  canSpendPsi: boolean;
  spendLockMessage: string;
  onPurchase: (ability: PsionicAbility) => void;
}> = ({ treeName, tiers, lines, purchased, remainingPsi, canSpendPsi, spendLockMessage, onPurchase }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const nodeRefs = React.useRef(new Map<string, HTMLDivElement>());
  const [linePositions, setLinePositions] = React.useState<PositionedLine[]>([]);
  const [containerHeight, setContainerHeight] = React.useState(0);

  const refreshLines = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const updatedLines: PositionedLine[] = [];

    lines.forEach(({ fromId, toId }) => {
      const fromEl = nodeRefs.current.get(fromId);
      const toEl = nodeRefs.current.get(toId);
      if (!fromEl || !toEl) return;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      updatedLines.push({
        from: {
          x: fromRect.left - containerRect.left + fromRect.width / 2,
          y: fromRect.top - containerRect.top + fromRect.height / 2
        },
        to: {
          x: toRect.left - containerRect.left + toRect.width / 2,
          y: toRect.top - containerRect.top + toRect.height / 2
        }
      });
    });

    setContainerHeight(containerRect.height);
    setLinePositions(updatedLines);
  }, [lines]);

  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(refreshLines);
    return () => cancelAnimationFrame(frame);
  }, [refreshLines, tiers]);

  React.useEffect(() => {
    const handleResize = () => refreshLines();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [refreshLines]);

  const orderedTiers = Array.from(tiers.keys()).sort((a, b) => a - b);
  const starterTier = tiers.get(1) ?? [];
  const tierTwo = tiers.get(2) ?? [];
  const remainingTiers = orderedTiers.filter((tier) => tier > 2);
  const orbitRadius = Math.max(140, 80 + tierTwo.length * 14);
  const outerTierBaseSpacing = 180;
  const outerTierSpacingTaper = 20;
  const outerTierSpacingMin = 130;
  const starterRadius = starterTier.length > 1 ? 38 : 0;
  const tierTwoAngleStep = tierTwo.length > 0 ? (2 * Math.PI) / tierTwo.length : 0;
  const starterAngleStep = starterTier.length > 0 ? (2 * Math.PI) / starterTier.length : 0;

  const layout = React.useMemo(() => {
    const positions = new Map<string, PositionedNode>();
    let maxRadius = Math.max(orbitRadius, starterRadius);

    starterTier.forEach((ability, index) => {
      const angle = starterAngleStep * index - Math.PI / 2;
      const x = Math.cos(angle) * starterRadius;
      const y = Math.sin(angle) * starterRadius;
      positions.set(ability.id, { ability, x, y });
    });

    tierTwo.forEach((ability, index) => {
      const angle = tierTwoAngleStep * index - Math.PI / 2;
      const x = Math.cos(angle) * orbitRadius;
      const y = Math.sin(angle) * orbitRadius;
      positions.set(ability.id, { ability, x, y });
    });

    remainingTiers.forEach((tier) => {
      const abilitiesForTier = tiers.get(tier) ?? [];
      const tierRadius = orbitRadius +
        Array.from({ length: tier - 2 }).reduce((distance, _, idx) => {
          const stepSpacing = Math.max(outerTierSpacingMin, outerTierBaseSpacing - outerTierSpacingTaper * idx);
          return distance + stepSpacing;
        }, 0);
      maxRadius = Math.max(maxRadius, tierRadius);

      const fallbackStep = abilitiesForTier.length > 0 ? (2 * Math.PI) / abilitiesForTier.length : 0;
      const grouped = new Map<string, Array<{ ability: PsionicAbility; baseAngle: number }>>();

      abilitiesForTier.forEach((ability, index) => {
        const parentPositions = ability.prerequisiteIds
          .map((id) => positions.get(id))
          .filter((entry): entry is PositionedNode => Boolean(entry));

        let baseAngle = parentPositions.length
          ? parentPositions.reduce((sum, pos) => sum + Math.atan2(pos.y, pos.x), 0) / parentPositions.length
          : fallbackStep * index - Math.PI / 2;

        if (tier === 3 && parentPositions.length) {
          const anchorAngle = Math.atan2(parentPositions[0].y, parentPositions[0].x);
          const maxOffset = 0.3;
          const offsetFromAnchor = baseAngle - anchorAngle;
          const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offsetFromAnchor));
          baseAngle = anchorAngle + clampedOffset;
        }

        const anchorKey = parentPositions.length ? ability.prerequisiteIds[0] : `fallback-${ability.id}`;
        if (!grouped.has(anchorKey)) grouped.set(anchorKey, []);
        grouped.get(anchorKey)!.push({ ability, baseAngle });
      });

      grouped.forEach((entries) => {
        entries.sort((a, b) => a.baseAngle - b.baseAngle);
        const maxSpread = tier === 3 ? 0.35 : 0.65;
        const minSpread = tier === 3 ? 0.22 : 0.35;
        const spread = Math.min(maxSpread, Math.max(minSpread, (Math.PI * 0.5) / Math.max(entries.length, 2)));
        const offsetStart = -((entries.length - 1) / 2) * spread;

        entries.forEach((entry, idx) => {
          const angle = entry.baseAngle + offsetStart + idx * spread;
          const x = Math.cos(angle) * tierRadius;
          const y = Math.sin(angle) * tierRadius;
          positions.set(entry.ability.id, { ability: entry.ability, x, y });
        });
      });
    });

    return { positions: Array.from(positions.values()), maxRadius };
  }, [orbitRadius, remainingTiers, starterAngleStep, starterRadius, starterTier, tierTwo, tierTwoAngleStep, tiers]);

  const centerHeight = Math.max(layout.maxRadius * 2 + 180, 420);

  return (
    <div ref={containerRef} style={{ position: "relative", padding: "1.25rem 1rem 1rem" }}>
      <svg
        width="100%"
        height={containerHeight}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {linePositions.map((line, idx) => (
          <line
            key={`${treeName}-line-${idx}`}
            x1={line.from.x}
            y1={line.from.y}
            x2={line.to.x}
            y2={line.to.y}
            stroke="#345678"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.7}
          />
        ))}
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div
          style={{
            position: "relative",
            minHeight: centerHeight,
            marginBottom: "0.25rem"
          }}
        >
          {layout.positions.map(({ ability, x, y }) => {
            const unlocked = isAbilityUnlocked(ability, purchased, { allowTier1WithoutPrereq: false });
            const isPurchased = purchased.has(ability.id);
            const isStarter = ability.tier === 1 && ability.prerequisiteIds.length === 0;
            return (
              <div
                key={ability.id}
                style={{ position: "absolute", left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: "translate(-50%, -50%)" }}
              >
                <AbilityNode
                  ability={ability}
                  purchased={isPurchased}
                  unlocked={unlocked}
                  isStarter={isStarter}
                  remainingPsi={remainingPsi}
                  canSpend={canSpendPsi}
                  spendLockReason={spendLockMessage}
                  onPurchase={onPurchase}
                  buttonRef={(node) => {
                    if (!node) return;
                    nodeRefs.current.set(ability.id, node);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PsionicsPage: React.FC = () => {
  const [abilities, setAbilities] = React.useState<PsionicAbility[]>([]);
  const [abilitiesError, setAbilitiesError] = React.useState<string | null>(null);
  const [loadingAbilities, setLoadingAbilities] = React.useState(true);
  const abilityIds = React.useMemo(() => new Set(abilities.map((a) => a.id)), [abilities]);
  const abilityCostMap = React.useMemo(() => new Map(abilities.map((a) => [a.id, a.tier])), [abilities]);
  const abilityById = React.useMemo(() => new Map(abilities.map((a) => [a.id, a])), [abilities]);
  const abilityKeyToId = React.useMemo(
    () => new Map(abilities.map((a) => [`${a.tree}:${a.name}`, a.id])),
    [abilities]
  );

  const { selectedId } = useSelectedCharacter();
  const [ancillarySelection, setAncillarySelection] = React.useState<AncillarySelectionState>(() =>
    readAncillarySelection(selectedId)
  );
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacter, setLoadingCharacter] = React.useState(false);
  const [ancillaryModalOpen, setAncillaryModalOpen] = React.useState(false);
  const [ancillaryChoices, setAncillaryChoices] = React.useState<Record<string, Set<string>>>({});
  const [pendingAncillaries, setPendingAncillaries] = React.useState<string[]>([]);
  const [activeAncillaryId, setActiveAncillaryId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoadingAbilities(true);
    setAbilitiesError(null);
    api
      .listPsionicAbilities()
      .then((rows) => {
        if (!active) return;
        const parsed = parsePsionicsRows(
          rows.map((row) => ({
            tree: row.ability_tree,
            name: row.ability,
            tier: row.tier ?? 0,
            prerequisite: row.prerequisite ?? null,
            description: row.description ?? "",
            energyCost: row.energy_cost ?? 0,
            formula: null
          }))
        );
        setAbilities(parsed);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Failed to load psionic abilities.";
        setAbilitiesError(message);
      })
      .finally(() => {
        if (!active) return;
        setLoadingAbilities(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const storageKey = React.useMemo(() => (selectedId ? `${PSIONICS_STORAGE_KEY}:${selectedId}` : null), [selectedId]);
  const backgroundBenefits = React.useMemo(() => {
    const adulthoodBackgrounds = selectedCharacter?.backgrounds?.adulthood ?? [];
    const granted = new Set<string>();
    let psiBonus = 0;

    adulthoodBackgrounds.forEach((name) => {
      const normalized = name.trim().toLowerCase() as keyof typeof PSION_BACKGROUND_CONFIG;
      const config = PSION_BACKGROUND_CONFIG[normalized];
      if (!config) return;
      psiBonus += config.psiBonus;
      config.granted.forEach(({ tree, name: abilityName }) => {
        const id = abilityKeyToId.get(`${tree}:${abilityName}`);
        if (id) granted.add(id);
      });
    });

    return { psiBonus, grantedIds: Array.from(granted) };
  }, [abilityKeyToId, selectedCharacter?.backgrounds?.adulthood]);

  const psionAncillaries = React.useMemo(() => {
    const selected = new Set(
      ancillarySelection.selected.filter((id) => PSION_ANCILLARY_IDS.has(id))
    );
    return selected;
  }, [ancillarySelection.selected]);

  const psionAncillaryList = React.useMemo(
    () =>
      Array.from(psionAncillaries).sort(
        (a, b) => PSION_ANCILLARY_ORDER.indexOf(a) - PSION_ANCILLARY_ORDER.indexOf(b)
      ),
    [psionAncillaries]
  );

  const { data: definitions } = useDefinitions();
  const raceDetails = (definitions?.raceDetails ?? {}) as Record<string, RaceDetailProfile>;

  const lineagePsi = React.useMemo(() => {
    const getPsi = (key?: string) => (key ? raceDetails[key]?.disciplines?.psiPoints ?? 0 : 0);
    return getPsi(selectedCharacter?.raceKey) + getPsi(selectedCharacter?.subraceKey);
  }, [raceDetails, selectedCharacter?.raceKey, selectedCharacter?.subraceKey]);

  const [state, setState] = React.useState<PsiState>(() => loadPersistedState(storageKey, abilityIds));
  const ancillaryPicksState = state.ancillaryPicks ?? {};
  const lockedAncillaries = state.lockedAncillaries ?? new Set<string>();
  const ancillaryStorageKey = React.useMemo(() => getAncillaryStorageKey(selectedId), [selectedId]);

  const resolveAncillaryUnlocks = React.useCallback(
    (ancillaryId: string, abilityIds: string[]): Set<string> => {
      if (ancillaryId !== "mythic-psion") {
        return new Set(abilityIds);
      }

      const unlocked = new Set<string>();

      const addWithPrerequisites = (id: string) => {
        if (unlocked.has(id)) return;
        unlocked.add(id);
        const ability = abilityById.get(id);
        ability?.prerequisiteIds.forEach((prereqId) => addWithPrerequisites(prereqId));
      };

      abilityIds.forEach(addWithPrerequisites);
      return unlocked;
    },
    [abilityById]
  );

  const ancillaryUnlockedAbilities = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    Object.entries(ancillaryPicksState).forEach(([ancillaryId, abilityIds]) => {
      map.set(ancillaryId, resolveAncillaryUnlocks(ancillaryId, abilityIds));
    });
    return map;
  }, [ancillaryPicksState, resolveAncillaryUnlocks]);

  React.useEffect(() => {
    const nextState = loadPersistedState(storageKey, abilityIds);
    const freeAbilities = new Set([...nextState.backgroundPicks, ...backgroundBenefits.grantedIds]);
    Object.entries(nextState.ancillaryPicks).forEach(([ancillaryId, list]) => {
      resolveAncillaryUnlocks(ancillaryId, list).forEach((id) => freeAbilities.add(id));
    });
    const purchased = new Set(nextState.purchased);
    freeAbilities.forEach((id) => purchased.delete(id));

    setState({
      purchased,
      backgroundPicks: nextState.backgroundPicks,
      ancillaryPicks: nextState.ancillaryPicks,
      lockedAncillaries: nextState.lockedAncillaries
    });
  }, [abilityIds, backgroundBenefits.grantedIds, resolveAncillaryUnlocks, storageKey]);

  React.useEffect(() => {
    persistState(storageKey, state);
  }, [state, storageKey]);

  React.useEffect(() => {
    setState((prev) => {
      const nextAncillaryPicks: Record<string, string[]> = {};
      let changed = false;
      const nextLocked = new Set(Array.from(prev.lockedAncillaries).filter((id) => psionAncillaries.has(id)));

      psionAncillaries.forEach((id) => {
        const existing = prev.ancillaryPicks[id] ?? [];
        const filtered = existing.filter((abilityId) => abilityIds.has(abilityId));
        if (filtered.length !== existing.length || !(id in prev.ancillaryPicks)) changed = true;
        nextAncillaryPicks[id] = filtered;
      });

      Object.keys(prev.ancillaryPicks).forEach((id) => {
        if (!psionAncillaries.has(id)) changed = true;
      });

      if (nextLocked.size !== prev.lockedAncillaries.size) changed = true;

      if (!changed) return prev;
      return { ...prev, ancillaryPicks: nextAncillaryPicks, lockedAncillaries: nextLocked };
    });
  }, [abilityIds, psionAncillaries]);

  React.useEffect(() => {
    setSelectedCharacter(null);
    setAncillarySelection(readAncillarySelection(selectedId));
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

  React.useEffect(() => {
    setState((prev) => {
      const nextLocked = new Set(prev.lockedAncillaries);
      psionAncillaryList.forEach((id, idx) => {
        const hasHigherTier = idx < psionAncillaryList.length - 1;
        if (hasHigherTier && (prev.ancillaryPicks[id]?.length ?? 0) > 0) {
          nextLocked.add(id);
        }
      });

      if (nextLocked.size === prev.lockedAncillaries.size) return prev;
      return { ...prev, lockedAncillaries: nextLocked };
    });
  }, [psionAncillaryList]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ancillaryStorageKey) {
        setAncillarySelection(readAncillarySelection(selectedId));
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, [ancillaryStorageKey, selectedId]);

  const mentalAttribute = selectedCharacter?.attributes?.MENTAL ?? 0;
  const characterLevel = selectedCharacter?.level ?? 1;
  const psiPerLevel = 3 + mentalAttribute;
  const levelPsi = Math.max(0, characterLevel - 1) * psiPerLevel;
  const totalPsiPool = DEFAULT_PSI_POINTS + backgroundBenefits.psiBonus + lineagePsi + levelPsi;
  const fledglingLocked = psionAncillaries.has("fledgling-psion") &&
    (ancillaryPicksState["fledgling-psion"]?.length ?? 0) > 0;
  const manifoldManifestationLimit = mentalAttribute + (fledglingLocked ? mentalAttribute : 0);

  const tierAdvancementAvailable = characterLevel === 1 || (characterLevel >= 6 && (characterLevel - 1) % 5 === 0);
  const completedTiers = Math.floor(Math.max(0, characterLevel - 1) / 5);
  const nextTierLevel = (completedTiers + 1) * 5 + 1;
  const spendLockMessage = tierAdvancementAvailable
    ? ""
    : `Psi can only be spent during Character Tier Advancements. Next window opens at level ${Math.max(6, nextTierLevel)}.`;

  const spentPsi = React.useMemo(
    () => Array.from(state.purchased).reduce((sum, id) => sum + (abilityCostMap.get(id) ?? 0), 0),
    [abilityCostMap, state.purchased]
  );

  const remainingPsi = Math.max(0, totalPsiPool - spentPsi);

  const ownedAbilities = React.useMemo(() => {
    const owned = new Set<string>(state.backgroundPicks);
    backgroundBenefits.grantedIds.forEach((id) => owned.add(id));
    ancillaryUnlockedAbilities.forEach((list) => list.forEach((id) => owned.add(id)));
    state.purchased.forEach((id) => owned.add(id));
    return owned;
  }, [ancillaryUnlockedAbilities, backgroundBenefits.grantedIds, state.backgroundPicks, state.purchased]);

  const trees = React.useMemo(() => {
    const byTree = new Map<string, PsionicAbility[]>();
    const byTreeAndName = new Map<string, Map<string, PsionicAbility>>();

    abilities.forEach((ability) => {
      if (!byTree.has(ability.tree)) {
        byTree.set(ability.tree, []);
        byTreeAndName.set(ability.tree, new Map());
      }
      byTree.get(ability.tree)!.push(ability);
      byTreeAndName.get(ability.tree)!.set(ability.name, ability);
    });

    const layouts = new Map<string, { tiers: Map<number, PsionicAbility[]>; lines: LineSegment[] }>();

    byTree.forEach((list, treeName) => {
      const override = TREE_OVERRIDES[treeName];
      const tiers = groupAbilitiesByTier(list, override);
      const abilityByName = byTreeAndName.get(treeName)!;
      const lines = buildLineSegments(list, abilityById, abilityByName, override);
      layouts.set(treeName, { tiers, lines });
    });

    return layouts;
  }, [abilities, abilityById]);

  const unlockedByTree = React.useMemo(() => {
    const grouped = new Map<string, PsionicAbility[]>();
    abilities.forEach((ability) => {
      if (!ownedAbilities.has(ability.id)) return;
      if (!grouped.has(ability.tree)) grouped.set(ability.tree, []);
      grouped.get(ability.tree)!.push(ability);
    });

    grouped.forEach((list) => {
      list.sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier - b.tier));
    });

    return grouped;
  }, [abilities, ownedAbilities]);

  const ancillaryEnergyOverrides = React.useMemo(() => {
    const overrides = new Map<string, number>();
    ancillaryUnlockedAbilities.forEach((abilityIds, ancillaryId) => {
      const override = PSION_ANCILLARY_CONFIG[ancillaryId]?.energyCostOverride;
      if (!override) return;
      abilityIds.forEach((abilityId) => overrides.set(abilityId, override));
    });
    return overrides;
  }, [ancillaryUnlockedAbilities]);

  const startAncillaryModal = React.useCallback(
    (customList?: string[]) => {
      const pending = (customList ?? psionAncillaryList).filter((id) => !lockedAncillaries.has(id));
      if (pending.length === 0) return;

      const initial: Record<string, Set<string>> = {};
      psionAncillaryList.forEach((id) => {
        const saved = ancillaryPicksState[id] ?? [];
        const limit = lockedAncillaries.has(id) ? saved.length : Math.max(mentalAttribute, 0);
        initial[id] = new Set(saved.slice(0, limit));
      });

      setPendingAncillaries(pending);
      setActiveAncillaryId(pending[0]);
      setAncillaryChoices(initial);
      setAncillaryModalOpen(true);
    },
    [ancillaryPicksState, lockedAncillaries, mentalAttribute, psionAncillaryList]
  );

  const closeAncillaryModal = React.useCallback(() => {
    setAncillaryModalOpen(false);
    setActiveAncillaryId(null);
    setPendingAncillaries([]);
    setAncillaryChoices({});
  }, []);

  const psionicsLockRequested = Boolean(
    (ancillarySelection.flags as { psionicsLockRequested?: boolean } | undefined)?.psionicsLockRequested
  );

  const clearPsionicsLockRequest = React.useCallback(() => {
    setAncillarySelection((prev) => {
      if (!prev.flags?.psionicsLockRequested) return prev;
      const nextSelection: AncillarySelectionState = {
        ...prev,
        flags: { ...prev.flags, psionicsLockRequested: false }
      };
      persistAncillarySelection(selectedId, nextSelection);
      return nextSelection;
    });
  }, [selectedId]);

  React.useEffect(() => {
    if (!psionicsLockRequested || psionAncillaryList.length === 0) return;
    clearPsionicsLockRequest();
    startAncillaryModal();
  }, [clearPsionicsLockRequest, psionAncillaryList.length, psionicsLockRequested, startAncillaryModal]);

  const toggleAncillaryAbility = (ancillaryId: string, abilityId: string) => {
    if (!psionAncillaries.has(ancillaryId) || ancillaryId !== activeAncillaryId) return;
    setAncillaryChoices((prev) => {
      const next = { ...prev } as Record<string, Set<string>>;
      const existing = new Set(next[ancillaryId] ?? []);
      const chosenElsewhere = Object.entries(prev).some(
        ([key, picks]) => key !== ancillaryId && picks?.has(abilityId)
      );

      if (existing.has(abilityId)) {
        existing.delete(abilityId);
      } else {
        if (mentalAttribute <= 0 || existing.size >= mentalAttribute || chosenElsewhere) return prev;
        existing.add(abilityId);
      }

      next[ancillaryId] = existing;
      return next;
    });
  };

  const confirmAncillaryChoices = () => {
    if (!activeAncillaryId) return;

    const selected = ancillaryChoices[activeAncillaryId] ?? new Set(ancillaryPicksState[activeAncillaryId] ?? []);

    setState((prev) => {
      const nextPicks: Record<string, string[]> = { ...prev.ancillaryPicks, [activeAncillaryId]: Array.from(selected) };
      const nextLocked = new Set(prev.lockedAncillaries);
      nextLocked.add(activeAncillaryId);

      return { ...prev, ancillaryPicks: nextPicks, lockedAncillaries: nextLocked };
    });

    setAncillaryChoices((prev) => {
      const next = { ...prev };
      delete next[activeAncillaryId];
      return next;
    });

    const [, ...remaining] = pendingAncillaries;
    if (remaining.length === 0) {
      closeAncillaryModal();
    } else {
      setPendingAncillaries(remaining);
      setActiveAncillaryId(remaining[0]);
    }
  };

  const handlePurchase = (ability: PsionicAbility) => {
    setState((prev) => {
      if (!tierAdvancementAvailable) return prev;
      const owned = new Set<string>([...prev.backgroundPicks, ...backgroundBenefits.grantedIds, ...prev.purchased]);
      Object.entries(prev.ancillaryPicks).forEach(([ancillaryId, list]) => {
        resolveAncillaryUnlocks(ancillaryId, list).forEach((id) => owned.add(id));
      });
      if (owned.has(ability.id)) return prev;
      const starterAbility = ability.tier === 1 && ability.prerequisiteIds.length === 0;
      if (!starterAbility && !isAbilityUnlocked(ability, owned, { allowTier1WithoutPrereq: false })) return prev;
      const psiCost = ability.tier;
      const spent = Array.from(prev.purchased).reduce((sum, id) => sum + (abilityCostMap.get(id) ?? 0), 0);
      const available = totalPsiPool - spent;
      if (available < psiCost) return prev;

      const nextPurchased = new Set(prev.purchased);
      nextPurchased.add(ability.id);
      return { ...prev, purchased: nextPurchased };
    });
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

  if (loadingAbilities) {
    return <p>Loading psionic abilities...</p>;
  }

  if (abilitiesError) {
    return <p style={{ color: "#f55" }}>{abilitiesError}</p>;
  }

  if (abilities.length === 0) {
    return <p>No psionic abilities are available yet.</p>;
  }

  return (
    <>
      {ancillaryModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 40,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "2rem 1rem",
            overflowY: "auto"
          }}
        >
          <div
            style={{
              background: "#0f131a",
              border: "1px solid #1f2935",
              borderRadius: 12,
              padding: "1rem",
              width: "min(960px, 95vw)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
              color: "#e6edf7"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Lock Psion Ancillaries</h3>
              <button
                onClick={closeAncillaryModal}
                style={{ padding: "0.4rem 0.75rem", background: "#1f2935", color: "#e5e7eb", border: "1px solid #2b3747", borderRadius: 6 }}
              >
                Close
              </button>
            </div>
            <p style={{ marginTop: 8, color: "#c5ccd9" }}>
              Choose up to {mentalAttribute} abilities from the current ancillary's tier. Abilities already unlocked elsewhere
              are not eligible. Once confirmed, selections are locked before moving to the next ancillary.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {activeAncillaryId ? (
                (() => {
                  const id = activeAncillaryId;
                  const config = PSION_ANCILLARY_CONFIG[id];
                  const selectedSet = ancillaryChoices[id] ?? new Set(ancillaryPicksState[id] ?? []);
                  const otherSelections = (abilityId: string) =>
                    Object.entries(ancillaryChoices).some(([otherId, picks]) => otherId !== id && picks?.has(abilityId));
                  const unlockedByCurrent = ancillaryUnlockedAbilities.get(id) ?? new Set<string>();
                  const ownedOutsideCurrent = new Set(ownedAbilities);
                  unlockedByCurrent.forEach((abilityId) => ownedOutsideCurrent.delete(abilityId));
                  const options = abilities.filter((ability) => {
                    if (ability.tier !== config.tier) return false;
                    if (ownedOutsideCurrent.has(ability.id) && !selectedSet.has(ability.id)) return false;
                    if (id !== "mythic-psion" && !isAbilityUnlocked(ability, ownedOutsideCurrent)) return false;
                    return true;
                  });
                  const disabledReason = mentalAttribute <= 0 ? "Mental Attribute must be above 0" : "";
                  const helper = config.energyCostOverride
                    ? "Chosen abilities cost 1 Energy."
                    : config.grantsManifoldBonus
                      ? "Adds your Mental attribute to Manifold Manifestation."
                      : "";
                  const remainingQueue = pendingAncillaries.slice(1);

                  return (
                    <div
                      key={`ancillary-${id}`}
                      style={{
                        border: "1px solid #1f2935",
                        borderRadius: 10,
                        padding: "0.75rem",
                        background: "#0c111a"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{PSION_ANCILLARY_LABELS[id] ?? id}</div>
                          <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                            Tier {config.tier} abilities • {helper}
                          </div>
                          {remainingQueue.length > 0 ? (
                            <div style={{ fontSize: 12, color: "#9aa3b5", marginTop: 4 }}>
                              Next: {remainingQueue.map((nextId) => PSION_ANCILLARY_LABELS[nextId] ?? nextId).join(", ")}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: "#9aa3b5" }}>
                          Selected: {selectedSet.size}/{Math.max(mentalAttribute, 0)}
                        </div>
                      </div>
                      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                        {options.length === 0 && (
                          <div style={{ color: "#9aa3b5" }}>No abilities available for this tier.</div>
                        )}
                        {options.map((ability) => {
                          const chosen = selectedSet.has(ability.id);
                          const unavailable =
                            (!chosen && (ownedOutsideCurrent.has(ability.id) || otherSelections(ability.id))) ||
                            mentalAttribute <= 0;
                          return (
                            <label
                              key={`${id}-${ability.id}`}
                              style={{
                                border: "1px solid #1f2935",
                                borderRadius: 8,
                                padding: "0.6rem 0.75rem",
                                background: chosen ? "#162235" : "#0f141d",
                                display: "flex",
                                gap: 8,
                                alignItems: "flex-start",
                                opacity: unavailable ? 0.6 : 1
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={chosen}
                                disabled={unavailable}
                                onChange={() => toggleAncillaryAbility(id, ability.id)}
                                style={{ marginTop: 4 }}
                              />
                              <div style={{ fontSize: 13 }}>
                                <div style={{ fontWeight: 700 }}>{ability.name}</div>
                                <div style={{ color: "#9aa3b5" }}>{ability.tree} • Tier {ability.tier}</div>
                                {unlockedByCurrent.has(ability.id) ? (
                                  <div style={{ color: "#34d399", fontSize: 12 }}>Unlocked</div>
                                ) : null}
                                {otherSelections(ability.id) ? (
                                  <div style={{ color: "#f97316", fontSize: 12 }}>Chosen for another ancillary.</div>
                                ) : null}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {disabledReason && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#f7a046" }}>{disabledReason}</div>
                      )}
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => setAncillaryChoices((prev) => ({ ...prev, [id]: new Set() }))}
                          style={{ padding: "0.55rem 0.9rem", background: "#1f2935", color: "#e5e7eb", border: "1px solid #2b3747", borderRadius: 8 }}
                        >
                          Clear
                        </button>
                        <button
                          onClick={confirmAncillaryChoices}
                          disabled={selectedSet.size === 0 || selectedSet.size > mentalAttribute || mentalAttribute <= 0}
                          style={{
                            padding: "0.55rem 0.9rem",
                            background: "#2563eb",
                            color: "#e6edf7",
                            border: "1px solid #1d4ed8",
                            borderRadius: 8,
                            opacity:
                              selectedSet.size === 0 || selectedSet.size > mentalAttribute || mentalAttribute <= 0 ? 0.6 : 1,
                            cursor:
                              selectedSet.size === 0 || selectedSet.size > mentalAttribute || mentalAttribute <= 0
                                ? "not-allowed"
                                : "pointer"
                          }}
                        >
                          {remainingQueue.length > 0 ? "Confirm & Next" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ color: "#9aa3b5" }}>No pending psion ancillaries to configure.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Psionics</h1>
          <p style={{ margin: "0.2rem 0", color: "#c5ccd9" }}>Character: {selectedCharacter.name}</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div
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
            <div style={{ fontSize: 24, fontWeight: 700, color: "#e6edf7" }}>{mentalAttribute}</div>
            <div style={{ fontSize: 12, color: "#9aa3b5" }}>Used for formulas and per-level gains</div>
          </div>
          <div
            style={{
              background: "#131a24",
              border: "1px solid #2b3747",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              minWidth: 210,
              color: "#c5ccd9",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}
          >
            <span style={{ fontSize: 13 }}>Manifold Manifestation Limit</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#e6edf7" }}>{manifoldManifestationLimit}</div>
            <div style={{ fontSize: 12, color: "#9aa3b5" }}>
              Base Mental: {mentalAttribute}
              {fledglingLocked ? ` + ${mentalAttribute} from Fledgling Psion` : ""}
            </div>
          </div>
          <div
            style={{
              background: "#131a24",
              border: "1px solid #2b3747",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              minWidth: 220,
              color: "#c5ccd9",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            <div style={{ fontSize: 13, color: "#9aa3b5" }}>Psi Points Earned</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#9ae6b4" }}>{totalPsiPool}</div>
            <div style={{ fontSize: 12, color: "#9aa3b5" }}>
              {lineagePsi > 0 && <span>Lineage: {lineagePsi}. </span>}
              Backgrounds: {backgroundBenefits.psiBonus}. Per level: {psiPerLevel} × {Math.max(0, characterLevel - 1)} = {levelPsi}
            </div>
          </div>
          <div
            style={{
              background: "#131a24",
              border: "1px solid #2b3747",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              minWidth: 220,
              color: tierAdvancementAvailable ? "#9ae6b4" : "#f7a046",
              display: "flex",
              flexDirection: "column",
              gap: 4
            }}
          >
            <div style={{ fontSize: 13, color: tierAdvancementAvailable ? "#9aa3b5" : "#f7c689" }}>
              Spending Window
            </div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {tierAdvancementAvailable ? "Open" : `Locked until level ${Math.max(6, nextTierLevel)}`}
            </div>
            <div style={{ fontSize: 12, color: "#9aa3b5" }}>
              Psi can only be spent during Character Tier Advancements (every 5 levels).
            </div>
          </div>
          <div
            style={{
              background: "#131a24",
              border: "1px solid #2b3747",
              borderRadius: 10,
              padding: "0.75rem 1rem",
              minWidth: 220,
              color: "#c5ccd9",
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}
          >
            <div style={{ fontSize: 13, color: "#9aa3b5" }}>Psion Ancillaries</div>
            <div style={{ fontSize: 12, color: "#dce7ff" }}>
              {psionAncillaryList.length
                ? psionAncillaryList.map((id) => PSION_ANCILLARY_LABELS[id] ?? id).join(", ")
                : "None selected"}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={startAncillaryModal}
                disabled={psionAncillaryList.length === 0}
                style={{
                  padding: "0.55rem 0.9rem",
                  background: psionAncillaryList.length === 0 ? "#1f2935" : "#2563eb",
                  color: "#e6edf7",
                  border: "1px solid #1d4ed8",
                  borderRadius: 8,
                  cursor: psionAncillaryList.length === 0 ? "not-allowed" : "pointer"
                }}
              >
                Lock Psion Ancillaries
              </button>
              <span style={{ fontSize: 12, color: "#9aa3b5" }}>
                {mentalAttribute > 0
                  ? `Select up to ${mentalAttribute} tier-matched abilities per ancillary.`
                  : "Mental Attribute is required to lock picks."}
              </span>
            </div>
          </div>
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
        {Array.from(trees.entries()).map(([treeName, layout]) => (
          <section
            key={treeName}
            style={{ background: "#0f131a", border: "1px solid #1f2935", borderRadius: 12, padding: "1rem" }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#e6edf7" }}>{treeName}</h2>
            <SkillTree
              treeName={treeName}
              tiers={layout.tiers}
              lines={layout.lines}
              purchased={ownedAbilities}
              remainingPsi={remainingPsi}
              canSpendPsi={tierAdvancementAvailable}
              spendLockMessage={spendLockMessage}
              onPurchase={handlePurchase}
            />
          </section>
        ))}
      </div>

      <section style={{ background: "#0f131a", border: "1px solid #1f2935", borderRadius: 12, padding: "1rem" }}>
        <h2 style={{ marginTop: 0, marginBottom: "0.75rem", color: "#e6edf7" }}>Unlocked Abilities</h2>
        {Array.from(unlockedByTree.entries()).length === 0 ? (
          <p style={{ color: "#9aa3b5", margin: 0 }}>No abilities unlocked yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {Array.from(unlockedByTree.entries()).map(([treeName, list]) => (
              <div
                key={`unlocked-${treeName}`}
                style={{
                  border: "1px solid #1f2935",
                  borderRadius: 10,
                  padding: "0.75rem",
                  background: "#0c111a"
                }}
              >
                <h3 style={{ margin: "0 0 0.5rem", color: "#dce7ff" }}>{treeName}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {list.map((ability) => {
                    const derived = ability.formula ? evaluateFormula(ability.formula, mentalAttribute) : null;
                    const formattedDescription = replaceMentalAttributePlaceholders(
                      ability.description,
                      mentalAttribute
                    );

                    return (
                      <div
                        key={`unlocked-${treeName}-${ability.id}`}
                        style={{
                          border: "1px solid #1f2935",
                          borderRadius: 8,
                          padding: "0.75rem",
                          background: "#0f1621"
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 4,
                            gap: 8
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: "#e6edf7" }}>{ability.name}</div>
                            <div style={{ fontSize: 12, color: "#9aa3b5" }}>Tier {ability.tier}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span
                              style={{
                                padding: "0.2rem 0.5rem",
                                borderRadius: 6,
                                border: "1px solid #273442",
                                background: "#111927",
                                color: "#9ae6b4",
                                fontSize: 12
                              }}
                            >
                              {ability.tier} Psi
                            </span>
                            <span
                              style={{
                                padding: "0.2rem 0.5rem",
                                borderRadius: 6,
                                border: "1px solid #273442",
                                background: "#0f141d",
                                color: "#c5ccd9",
                                fontSize: 12
                              }}
                            >
                              {(() => {
                                const overrideCost = ancillaryEnergyOverrides.get(ability.id);
                                const costLabel = overrideCost ?? ability.energyCost;
                                return overrideCost ? `Energy: ${costLabel} (ancillary)` : `Energy: ${costLabel}`;
                              })()}
                            </span>
                          </div>
                        </div>
                        <p style={{ margin: "0 0 0.5rem", color: "#c5ccd9", lineHeight: 1.4 }}>
                          {formattedDescription}
                        </p>
                        <div style={{ fontSize: 13, color: "#c5ccd9", marginBottom: 4 }}>
                          <strong>Prerequisites:</strong> {ability.prerequisiteNames.length ? ability.prerequisiteNames.join(", ") : "None"}
                        </div>
                        {ability.formula && (
                          <div style={{ fontSize: 13, color: "#c5ccd9" }}>
                            <strong>Formula:</strong> {ability.formula.replace(/\*/g, " × ")}
                            {derived !== null && ` = ${derived}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    </>
  );
};
