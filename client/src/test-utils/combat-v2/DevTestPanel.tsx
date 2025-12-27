/**
 * Dev Test Panel for Combat V2
 *
 * A floating control panel for manual testing that allows:
 * - Viewing/modifying mock combat state
 * - Simulating server events
 * - Switching between player/GM modes
 * - Controlling turn progression
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  getMockState,
  setMockState,
  resetMockState,
  isDevModeActive,
  type MockServerState,
} from "./devModeBootstrap";

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const panelStyles: React.CSSProperties = {
  position: "fixed",
  bottom: "10px",
  right: "10px",
  width: "320px",
  maxHeight: "500px",
  backgroundColor: "#1a1a2e",
  color: "#e0e0e0",
  borderRadius: "8px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  zIndex: 99999,
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "12px",
  overflow: "hidden",
};

const headerStyles: React.CSSProperties = {
  padding: "10px 14px",
  backgroundColor: "#16213e",
  borderBottom: "1px solid #0f3460",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "move",
};

const contentStyles: React.CSSProperties = {
  padding: "10px",
  maxHeight: "400px",
  overflowY: "auto",
};

const sectionStyles: React.CSSProperties = {
  marginBottom: "12px",
  padding: "8px",
  backgroundColor: "#0f3460",
  borderRadius: "4px",
};

const sectionTitleStyles: React.CSSProperties = {
  fontWeight: "bold",
  marginBottom: "6px",
  color: "#94bbe9",
};

const buttonStyles: React.CSSProperties = {
  padding: "6px 10px",
  backgroundColor: "#e94560",
  color: "white",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  marginRight: "6px",
  marginBottom: "4px",
  fontSize: "11px",
};

const secondaryButtonStyles: React.CSSProperties = {
  ...buttonStyles,
  backgroundColor: "#533483",
};

const selectStyles: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: "#1a1a2e",
  color: "#e0e0e0",
  border: "1px solid #0f3460",
  borderRadius: "4px",
  marginRight: "6px",
  fontSize: "11px",
};

const inputStyles: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: "#1a1a2e",
  color: "#e0e0e0",
  border: "1px solid #0f3460",
  borderRadius: "4px",
  marginRight: "6px",
  width: "60px",
  fontSize: "11px",
};

const minimizedStyles: React.CSSProperties = {
  position: "fixed",
  bottom: "10px",
  right: "10px",
  backgroundColor: "#e94560",
  color: "white",
  padding: "8px 12px",
  borderRadius: "20px",
  cursor: "pointer",
  zIndex: 99999,
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: "11px",
  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function DevTestPanel(): React.ReactElement | null {
  const [isMinimized, setIsMinimized] = useState(false);
  const [state, setState] = useState<MockServerState | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  const [apValue, setApValue] = useState<number>(6);
  const [energyValue, setEnergyValue] = useState<number>(100);

  // Check if dev mode is active
  const isActive = isDevModeActive();

  // Refresh state periodically
  useEffect(() => {
    if (!isActive) return;

    const updateState = () => {
      setState(getMockState());
    };

    updateState();
    const interval = setInterval(updateState, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Handle entity selection
  useEffect(() => {
    if (state && selectedEntity && state.entities[selectedEntity]) {
      const entity = state.entities[selectedEntity];
      setApValue(entity.ap?.current ?? 0);
      setEnergyValue(entity.energy?.current ?? 0);
    }
  }, [selectedEntity, state]);

  const handlePhaseChange = useCallback((phase: MockServerState["phase"]) => {
    setMockState({ phase });
  }, []);

  const handleAdvanceTurn = useCallback(() => {
    if (!state) return;
    const nextIndex = (state.currentTurnIndex + 1) % state.initiative.length;
    const isNewRound = nextIndex === 0;
    setMockState({
      currentTurnIndex: nextIndex,
      currentEntityId: state.initiative[nextIndex]?.entityId || null,
      round: isNewRound ? state.round + 1 : state.round,
    });
  }, [state]);

  const handleResetState = useCallback(() => {
    resetMockState();
  }, []);

  const handleModifyEntity = useCallback(() => {
    if (!state || !selectedEntity) return;
    const entity = state.entities[selectedEntity];
    if (!entity) return;

    const updatedEntities = {
      ...state.entities,
      [selectedEntity]: {
        ...entity,
        ap: { ...entity.ap, current: apValue, max: entity.ap?.max ?? apValue },
        energy: { ...entity.energy, current: energyValue, max: entity.energy?.max ?? energyValue },
      },
    };

    setMockState({ entities: updatedEntities });
  }, [state, selectedEntity, apValue, energyValue]);

  const handleKillEntity = useCallback(() => {
    if (!state || !selectedEntity) return;
    const entity = state.entities[selectedEntity];
    if (!entity) return;

    const updatedEntities = {
      ...state.entities,
      [selectedEntity]: {
        ...entity,
        alive: false,
        unconscious: false,
        energy: { ...entity.energy, current: 0 },
      },
    };

    setMockState({ entities: updatedEntities });
  }, [state, selectedEntity]);

  const handleAddEnemy = useCallback(() => {
    if (!state) return;
    const newId = `enemy-${Date.now()}`;
    const newEnemy = {
      id: newId,
      name: "New Goblin",
      displayName: "New Goblin",
      tier: "full" as const,
      faction: "enemy" as const,
      controller: "gm" as const,
      entityType: "monster" as const,
      level: 3,
      ap: { current: 4, max: 4 },
      energy: { current: 50, max: 50 },
      wounds: {},
      alive: true,
      unconscious: false,
    };

    const updatedEntities = { ...state.entities, [newId]: newEnemy };
    const updatedPositions = { ...state.gridPositions, [newId]: { row: 8, col: 15 } };
    const updatedInitiative = [
      ...state.initiative,
      { entityId: newId, roll: 12, tiebreaker: Math.random(), delayed: false, readied: false },
    ];

    setMockState({
      entities: updatedEntities,
      gridPositions: updatedPositions,
      initiative: updatedInitiative,
    });
  }, [state]);

  const handleSwitchToGM = useCallback(() => {
    const currentPath = window.location.pathname;
    if (currentPath.includes("/gm/")) {
      // Already on GM route, switch to player
      const newPath = currentPath.replace("/gm/campaigns/", "/player/campaigns/");
      window.location.href = newPath;
    } else {
      // Switch to GM route
      const newPath = currentPath.replace("/player/campaigns/", "/gm/campaigns/");
      window.location.href = newPath;
    }
  }, []);

  if (!isActive) {
    return null;
  }

  if (isMinimized) {
    return (
      <div style={minimizedStyles} onClick={() => setIsMinimized(false)}>
        Dev Panel
      </div>
    );
  }

  const currentEntity = state?.currentEntityId ? state.entities[state.currentEntityId] : null;
  const isGMRoute = window.location.pathname.includes("/gm/");

  return (
    <div style={panelStyles}>
      <div style={headerStyles}>
        <span style={{ fontWeight: "bold", color: "#94bbe9" }}>Combat V2 Dev Panel</span>
        <button
          style={{ ...buttonStyles, margin: 0, padding: "4px 8px" }}
          onClick={() => setIsMinimized(true)}
        >
          _
        </button>
      </div>

      <div style={contentStyles}>
        {/* State Overview */}
        <div style={sectionStyles}>
          <div style={sectionTitleStyles}>Combat State</div>
          <div>
            Phase: <strong>{state?.phase}</strong>
          </div>
          <div>
            Round: <strong>{state?.round}</strong>
          </div>
          <div>
            Turn: <strong>{currentEntity?.name || "None"}</strong>
          </div>
          <div>
            Entities: <strong>{Object.keys(state?.entities || {}).length}</strong>
          </div>
          <div style={{ marginTop: "6px" }}>
            <span style={{ color: isGMRoute ? "#4ade80" : "#94bbe9" }}>
              Mode: {isGMRoute ? "GM" : "Player"}
            </span>
          </div>
        </div>

        {/* Phase Controls */}
        <div style={sectionStyles}>
          <div style={sectionTitleStyles}>Phase</div>
          <button style={buttonStyles} onClick={() => handlePhaseChange("initiative")}>
            Initiative
          </button>
          <button style={buttonStyles} onClick={() => handlePhaseChange("active")}>
            Active
          </button>
          <button style={buttonStyles} onClick={() => handlePhaseChange("completed")}>
            Completed
          </button>
        </div>

        {/* Turn Controls */}
        <div style={sectionStyles}>
          <div style={sectionTitleStyles}>Turn</div>
          <button style={buttonStyles} onClick={handleAdvanceTurn}>
            Next Turn
          </button>
          <button style={secondaryButtonStyles} onClick={handleResetState}>
            Reset All
          </button>
        </div>

        {/* Entity Modifier */}
        <div style={sectionStyles}>
          <div style={sectionTitleStyles}>Modify Entity</div>
          <div style={{ marginBottom: "6px" }}>
            <select
              style={selectStyles}
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
            >
              <option value="">Select entity...</option>
              {Object.values(state?.entities || {}).map((entity: any) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name} ({entity.faction})
                </option>
              ))}
            </select>
          </div>
          {selectedEntity && (
            <>
              <div style={{ marginBottom: "6px" }}>
                <label>
                  AP:{" "}
                  <input
                    type="number"
                    style={inputStyles}
                    value={apValue}
                    onChange={(e) => setApValue(parseInt(e.target.value) || 0)}
                    min={0}
                    max={10}
                  />
                </label>
                <label>
                  Energy:{" "}
                  <input
                    type="number"
                    style={inputStyles}
                    value={energyValue}
                    onChange={(e) => setEnergyValue(parseInt(e.target.value) || 0)}
                    min={0}
                    max={200}
                  />
                </label>
              </div>
              <button style={buttonStyles} onClick={handleModifyEntity}>
                Apply
              </button>
              <button style={secondaryButtonStyles} onClick={handleKillEntity}>
                Kill
              </button>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div style={sectionStyles}>
          <div style={sectionTitleStyles}>Quick Actions</div>
          <button style={buttonStyles} onClick={handleAddEnemy}>
            + Add Enemy
          </button>
          <button style={secondaryButtonStyles} onClick={handleSwitchToGM}>
            {isGMRoute ? "Switch to Player" : "Switch to GM"}
          </button>
        </div>

        {/* Navigation Links */}
        <div style={sectionStyles}>
          <div style={sectionTitleStyles}>Navigate To</div>
          <div>
            <a
              href="/player/campaigns/dev-campaign-id/combat"
              style={{ color: "#94bbe9", marginRight: "10px" }}
            >
              Player Combat
            </a>
            <a href="/gm/campaigns/dev-campaign-id/combat" style={{ color: "#94bbe9" }}>
              GM Combat
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DevTestPanel;
