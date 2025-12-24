/**
 * PhaseDial Component
 *
 * Circular brass/iron mechanism displaying combat phase and round.
 * The centerpiece of the War Chronicle combat interface.
 */

import React from "react";
import type { CombatPhase } from "@shared/rules/combat";
import "./WarChronicle.css";

export interface PhaseDialProps {
  phase: CombatPhase;
  round: number;
  onPhaseClick?: (phase: CombatPhase) => void;
  className?: string;
}

// Roman numeral conversion
const toRoman = (num: number): string => {
  const romanNumerals: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];

  let result = "";
  let remaining = num;

  for (const [value, numeral] of romanNumerals) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }

  return result || "I";
};

// Phase display configuration
const PHASE_CONFIG: Record<CombatPhase, { rune: string; label: string; position: number }> = {
  "setup": { rune: "◉", label: "Setup", position: 0 },
  "initiative": { rune: "◎", label: "Initiative", position: 1 },
  "active-turn": { rune: "◈", label: "Active", position: 2 },
  "reaction-interrupt": { rune: "◐", label: "Interrupt", position: 3 },
  "resolution": { rune: "◑", label: "Resolve", position: 4 },
  "completed": { rune: "◯", label: "Complete", position: 5 },
};

export const PhaseDial: React.FC<PhaseDialProps> = ({
  phase,
  round,
  onPhaseClick,
  className = "",
}) => {
  const activeConfig = PHASE_CONFIG[phase];
  const rotationDegrees = (activeConfig.position * 60) % 360; // 6 phases, 60° each

  return (
    <div className={`phase-dial ${className}`} data-phase={phase}>
      {/* Outer Ring - Metal Frame */}
      <div className="phase-dial__frame">
        <svg className="phase-dial__decorative-ring" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r="95"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.3"
          />
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="5,5"
            opacity="0.2"
          />
        </svg>

        {/* Round Counter (Center) */}
        <div className="phase-dial__round">
          <span className="phase-dial__round-label">Round</span>
          <span className="phase-dial__round-value war-text-roman">
            {toRoman(round)}
          </span>
        </div>

        {/* Phase Indicator (Rotating) */}
        <div
          className="phase-dial__indicator"
          style={{
            transform: `rotate(${rotationDegrees}deg)`,
            transition: "transform 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)"
          }}
        >
          <div className="phase-dial__indicator-pointer" />
        </div>

        {/* Phase Runes (Around the dial) */}
        <div className="phase-dial__phases">
          {Object.entries(PHASE_CONFIG).map(([phaseKey, config]) => {
            const isActive = phaseKey === phase;
            const angle = (config.position * 60 - 90) * (Math.PI / 180); // -90 to start at top
            const radius = 75;
            const x = 100 + radius * Math.cos(angle);
            const y = 100 + radius * Math.sin(angle);

            return (
              <button
                key={phaseKey}
                className={`phase-dial__phase ${isActive ? "phase-dial__phase--active" : ""}`}
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%, -50%)"
                }}
                onClick={() => onPhaseClick?.(phaseKey as CombatPhase)}
                disabled={!onPhaseClick}
                title={config.label}
                aria-label={`${config.label} phase${isActive ? " (active)" : ""}`}
              >
                <span className="phase-dial__phase-rune">
                  {config.rune}
                </span>
                {isActive && (
                  <span className="phase-dial__phase-label">
                    {config.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Energy Connections (SVG Layer) */}
      <svg className="phase-dial__connections" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="phase-energy-gradient">
            <stop offset="0%" stopColor="var(--war-ember)" stopOpacity="0" />
            <stop offset="50%" stopColor="var(--war-ember-glow)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--war-ember)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Connection lines between phases */}
        <circle
          cx="100"
          cy="100"
          r="75"
          fill="none"
          stroke="url(#phase-energy-gradient)"
          strokeWidth="2"
          strokeDasharray="10,5"
          className="phase-dial__energy-ring"
          style={{
            animation: "war-rotate 20s linear infinite"
          }}
        />
      </svg>
    </div>
  );
};

export default PhaseDial;
