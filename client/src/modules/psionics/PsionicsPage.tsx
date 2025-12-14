import React from "react";
import { api, Character, RaceDetailProfile } from "../../api/client";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import { useDefinitions } from "../definitions/DefinitionsContext";
import psionicsCsv from "../../data/psionics.csv?raw";
import {
  DEFAULT_PSI_POINTS,
  PsionicAbility,
  evaluateFormula,
  isAbilityUnlocked,
  parsePsionicsCsv,
  replaceMentalAttributePlaceholders
} from "./psionicsUtils";
import { PSION_BACKGROUND_CONFIG, PSIONICS_STORAGE_KEY } from "./psionBackgrounds";

interface PsiState {
  purchased: Set<string>;
  backgroundPicks: Set<string>;
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
    return { purchased: new Set(), backgroundPicks: new Set() };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { purchased: new Set(), backgroundPicks: new Set() };
    }
    const parsed = JSON.parse(raw) as {
      purchased?: string[];
      backgroundPicks?: string[];
    };
    const purchased = Array.isArray(parsed.purchased)
      ? parsed.purchased.filter((id) => abilityIds.has(id))
      : [];
    const backgroundPicks = Array.isArray(parsed.backgroundPicks)
      ? parsed.backgroundPicks.filter((id) => abilityIds.has(id))
      : [];
    return { purchased: new Set(purchased), backgroundPicks: new Set(backgroundPicks) };
  } catch (err) {
    console.warn("Unable to parse psionics state", err);
    return { purchased: new Set(), backgroundPicks: new Set() };
  }
};

const persistState = (storageKey: string | null, state: PsiState) => {
  if (typeof window === "undefined" || !storageKey) return;
  try {
    const payload = JSON.stringify({
      purchased: Array.from(state.purchased),
      backgroundPicks: Array.from(state.backgroundPicks)
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
  const outerTierSpacing = 220;
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
      const tierRadius = orbitRadius + (tier - 2) * outerTierSpacing;
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
  const abilities = React.useMemo(() => parsePsionicsCsv(psionicsCsv), []);
  const abilityIds = React.useMemo(() => new Set(abilities.map((a) => a.id)), [abilities]);
  const abilityCostMap = React.useMemo(() => new Map(abilities.map((a) => [a.id, a.tier])), [abilities]);
  const abilityById = React.useMemo(() => new Map(abilities.map((a) => [a.id, a])), [abilities]);
  const abilityKeyToId = React.useMemo(
    () => new Map(abilities.map((a) => [`${a.tree}:${a.name}`, a.id])),
    [abilities]
  );

  const { selectedId } = useSelectedCharacter();
  const [selectedCharacter, setSelectedCharacter] = React.useState<Character | null>(null);
  const [characterError, setCharacterError] = React.useState<string | null>(null);
  const [loadingCharacter, setLoadingCharacter] = React.useState(false);

  const storageKey = React.useMemo(() => (selectedId ? `${PSIONICS_STORAGE_KEY}:${selectedId}` : null), [selectedId]);
  const backgroundBenefits = React.useMemo(() => {
    const adulthoodBackgrounds = selectedCharacter?.backgrounds?.adulthood ?? [];
    const granted = new Set<string>();
    let psiBonus = 0;

    adulthoodBackgrounds.forEach((name) => {
      const config = PSION_BACKGROUND_CONFIG[name.toLowerCase() as keyof typeof PSION_BACKGROUND_CONFIG];
      if (!config) return;
      psiBonus += config.psiBonus;
      config.granted.forEach(({ tree, name: abilityName }) => {
        const id = abilityKeyToId.get(`${tree}:${abilityName}`);
        if (id) granted.add(id);
      });
    });

    return { psiBonus, grantedIds: Array.from(granted) };
  }, [abilityKeyToId, selectedCharacter?.backgrounds?.adulthood]);

  const backgroundGrantKey = React.useMemo(
    () => backgroundBenefits.grantedIds.slice().sort().join("|"),
    [backgroundBenefits.grantedIds]
  );

  const { data: definitions } = useDefinitions();
  const raceDetails = (definitions?.raceDetails ?? {}) as Record<string, RaceDetailProfile>;

  const [state, setState] = React.useState<PsiState>(() => loadPersistedState(storageKey, abilityIds));

  React.useEffect(() => {
    const nextState = loadPersistedState(storageKey, abilityIds);
    const purchased = new Set([...nextState.purchased, ...nextState.backgroundPicks]);
    backgroundBenefits.grantedIds.forEach((id) => purchased.add(id));

    setState({
      purchased,
      backgroundPicks: nextState.backgroundPicks
    });
  }, [abilityIds, backgroundGrantKey, storageKey]);

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

  const mentalAttribute = selectedCharacter?.attributes?.MENTAL ?? 0;
  const characterLevel = selectedCharacter?.level ?? 1;
  const psiPerLevel = 3 + mentalAttribute;
  const lineagePsi =
    (selectedCharacter?.raceKey ? raceDetails[selectedCharacter.raceKey]?.disciplines?.psiPoints ?? 0 : 0) +
    (selectedCharacter?.subraceKey ? raceDetails[selectedCharacter.subraceKey]?.disciplines?.psiPoints ?? 0 : 0);
  const levelPsi = Math.max(0, characterLevel - 1) * psiPerLevel;
  const totalPsiPool = DEFAULT_PSI_POINTS + backgroundBenefits.psiBonus + lineagePsi + levelPsi;

  const tierAdvancementAvailable = characterLevel >= 6 && (characterLevel - 1) % 5 === 0;
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
      const purchased = state.purchased.has(ability.id);
      if (!purchased) return;
      if (!grouped.has(ability.tree)) grouped.set(ability.tree, []);
      grouped.get(ability.tree)!.push(ability);
    });

    grouped.forEach((list) => {
      list.sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier - b.tier));
    });

    return grouped;
  }, [abilities, state.purchased]);

  const handlePurchase = (ability: PsionicAbility) => {
    setState((prev) => {
      if (!tierAdvancementAvailable) return prev;
      if (prev.purchased.has(ability.id)) return prev;
      const starterAbility = ability.tier === 1 && ability.prerequisiteIds.length === 0;
      if (!starterAbility && !isAbilityUnlocked(ability, prev.purchased, { allowTier1WithoutPrereq: false })) return prev;
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

  return (
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
              purchased={state.purchased}
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
                              Energy: {ability.energyCost}
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
  );
};
