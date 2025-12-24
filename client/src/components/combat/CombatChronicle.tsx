/**
 * CombatChronicle Component
 *
 * Scrolling parchment-style battle log.
 * Displays combat events with thematic formatting and color coding.
 */

import React from "react";
import type {
  CombatLogEntry,
  CombatLogType,
  CombatEntity,
} from "@shared/rules/combat";
import "./WarChronicle.css";

export interface CombatChronicleProps {
  log: CombatLogEntry[];
  entities: CombatEntity[];
  onEntryClick?: (entry: CombatLogEntry) => void;
  maxEntries?: number;
  showFilters?: boolean;
  className?: string;
}

// Entry type configuration for styling and display
const ENTRY_CONFIG: Record<
  CombatLogType,
  { icon: string; color: string; label: string }
> = {
  combat_started: {
    icon: "⚔️",
    color: "var(--war-gold)",
    label: "Combat Begins",
  },
  combat_ended: {
    icon: "🏁",
    color: "var(--war-gold)",
    label: "Combat Ends",
  },
  round_started: {
    icon: "🔄",
    color: "var(--war-gold)",
    label: "New Round",
  },
  turn_started: {
    icon: "▶️",
    color: "var(--war-storm)",
    label: "Turn Start",
  },
  turn_ended: {
    icon: "⏸️",
    color: "var(--war-storm)",
    label: "Turn End",
  },
  action_declared: {
    icon: "⚡",
    color: "var(--war-ember)",
    label: "Action",
  },
  action_resolved: {
    icon: "✓",
    color: "var(--war-jade)",
    label: "Resolved",
  },
  action_cancelled: {
    icon: "✕",
    color: "var(--war-text-tertiary)",
    label: "Cancelled",
  },
  reaction_declared: {
    icon: "🛡️",
    color: "var(--war-storm)",
    label: "Reaction",
  },
  reaction_resolved: {
    icon: "✓",
    color: "var(--war-jade)",
    label: "Reaction Resolved",
  },
  wounds_applied: {
    icon: "💔",
    color: "var(--war-blood)",
    label: "Wound",
  },
  status_applied: {
    icon: "✨",
    color: "var(--war-jade)",
    label: "Status",
  },
  status_removed: {
    icon: "○",
    color: "var(--war-text-tertiary)",
    label: "Status Ended",
  },
  status_tick: {
    icon: "⏲️",
    color: "var(--war-text-secondary)",
    label: "Status Tick",
  },
  resources_updated: {
    icon: "📊",
    color: "var(--war-text-secondary)",
    label: "Resources",
  },
  gm_override: {
    icon: "👁️",
    color: "var(--war-gold)",
    label: "GM Override",
  },
};

export const CombatChronicle: React.FC<CombatChronicleProps> = ({
  log,
  entities,
  onEntryClick,
  maxEntries = 100,
  showFilters = false,
  className = "",
}) => {
  const [pinnedIds, setPinnedIds] = React.useState<Set<string>>(new Set());
  const [filterTypes, setFilterTypes] = React.useState<Set<CombatLogType>>(
    new Set()
  );
  const logEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  // Find entity by ID
  const getEntityName = (entityId?: string): string => {
    if (!entityId) return "Unknown";
    const entity = entities.find((e) => e.id === entityId);
    return entity?.name || "Unknown";
  };

  // Format entry message based on type and data
  const formatEntry = (entry: CombatLogEntry): string => {
    const source = getEntityName(entry.sourceEntityId);
    const target = getEntityName(entry.targetEntityId);
    const data = entry.data || {};

    switch (entry.type) {
      case "combat_started":
        return "The battle begins!";

      case "combat_ended":
        return `Combat concluded: ${data.reason || "unknown"}`;

      case "round_started":
        return `Round ${data.round || "?"} begins`;

      case "turn_started":
        return `${source}'s turn`;

      case "turn_ended":
        return `${source} ends their turn`;

      case "action_declared":
        return `${source} declares ${data.actionType || "action"}${
          target !== "Unknown" ? ` targeting ${target}` : ""
        }`;

      case "action_resolved":
        return `${source}'s ${data.actionType || "action"} resolves`;

      case "action_cancelled":
        return `${source}'s action cancelled`;

      case "reaction_declared":
        return `${source} reacts with ${data.reactionType || "reaction"}`;

      case "reaction_resolved":
        return `${source}'s reaction resolves`;

      case "wounds_applied":
        return `${target} takes ${data.woundType || ""} wound${
          data.count && data.count > 1 ? "s" : ""
        }`;

      case "status_applied":
        return `${target} gains ${data.statusKey || "status"}`;

      case "status_removed":
        return `${target} loses ${data.statusKey || "status"}`;

      case "status_tick":
        return `${source}'s ${data.statusKey || "status"} ticks`;

      case "resources_updated":
        return `${source}'s resources updated`;

      case "gm_override":
        return `GM: ${data.description || "Override applied"}`;

      default:
        return "Unknown event";
    }
  };

  // Toggle pin
  const togglePin = (entryId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  // Toggle filter
  const toggleFilter = (type: CombatLogType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Filter and limit entries
  const filteredLog = log
    .filter((entry) => {
      if (filterTypes.size === 0) return true;
      return filterTypes.has(entry.type);
    })
    .slice(-maxEntries);

  // Separate pinned and unpinned entries
  const pinnedEntries = filteredLog.filter((e) => pinnedIds.has(e.id));
  const unpinnedEntries = filteredLog.filter((e) => !pinnedIds.has(e.id));

  const chronicleClasses = [
    "combat-chronicle",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={chronicleClasses}>
      {/* Header */}
      <div className="combat-chronicle__header">
        <h3 className="combat-chronicle__title war-text-display">
          📜 Battle Chronicle
        </h3>
        {showFilters && (
          <button
            className="combat-chronicle__filter-toggle"
            onClick={() => {
              /* Could expand filter UI */
            }}
            title="Filter events"
          >
            🔍
          </button>
        )}
      </div>

      {/* Pinned Entries */}
      {pinnedEntries.length > 0 && (
        <div className="combat-chronicle__pinned">
          <div className="combat-chronicle__pinned-label">
            📌 Pinned Events
          </div>
          {pinnedEntries.map((entry) => (
            <ChronicleEntry
              key={`pinned-${entry.id}`}
              entry={entry}
              config={ENTRY_CONFIG[entry.type]}
              message={formatEntry(entry)}
              isPinned
              onTogglePin={() => togglePin(entry.id)}
              onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
            />
          ))}
        </div>
      )}

      {/* Scrolling Log */}
      <div className="combat-chronicle__scroll">
        {unpinnedEntries.length === 0 ? (
          <div className="combat-chronicle__empty">
            No combat events yet...
          </div>
        ) : (
          unpinnedEntries.map((entry) => (
            <ChronicleEntry
              key={entry.id}
              entry={entry}
              config={ENTRY_CONFIG[entry.type]}
              message={formatEntry(entry)}
              isPinned={false}
              onTogglePin={() => togglePin(entry.id)}
              onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
            />
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

// Individual chronicle entry
interface ChronicleEntryProps {
  entry: CombatLogEntry;
  config: { icon: string; color: string; label: string };
  message: string;
  isPinned: boolean;
  onTogglePin: () => void;
  onClick?: () => void;
}

const ChronicleEntry: React.FC<ChronicleEntryProps> = ({
  entry,
  config,
  message,
  isPinned,
  onTogglePin,
  onClick,
}) => {
  const isImportant =
    entry.type === "round_started" ||
    entry.type === "combat_started" ||
    entry.type === "combat_ended";

  const timestamp = new Date(entry.timestamp).toLocaleTimeString();

  const entryClasses = [
    "combat-chronicle__entry",
    isImportant && "combat-chronicle__entry--important",
    onClick && "combat-chronicle__entry--clickable",
    isPinned && "combat-chronicle__entry--pinned",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={entryClasses}
      style={{ borderLeftColor: config.color } as React.CSSProperties}
      onClick={onClick}
      title={`${timestamp} - ${config.label}`}
    >
      <div className="combat-chronicle__entry-icon">{config.icon}</div>
      <div className="combat-chronicle__entry-content">
        <div className="combat-chronicle__entry-message">{message}</div>
        {entry.data && Object.keys(entry.data).length > 0 && (
          <div className="combat-chronicle__entry-details war-text-mono">
            {JSON.stringify(entry.data, null, 0)}
          </div>
        )}
      </div>
      <button
        className={`combat-chronicle__entry-pin ${
          isPinned ? "combat-chronicle__entry-pin--active" : ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        title={isPinned ? "Unpin" : "Pin"}
      >
        📌
      </button>
    </div>
  );
};

export default CombatChronicle;
