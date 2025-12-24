/**
 * ReactionSigil Component
 *
 * Floating magical rune button for declaring reactions.
 * Pulses dramatically when an interruptible action is pending.
 */

import React from "react";
import "./WarChronicle.css";

export interface ReactionSigilProps {
  available: boolean;
  pulsing?: boolean;
  onClick: () => void;
  label?: string;
  className?: string;
}

export const ReactionSigil: React.FC<ReactionSigilProps> = ({
  available,
  pulsing = false,
  onClick,
  label = "React",
  className = "",
}) => {
  const sigilClasses = [
    "reaction-sigil",
    !available && "reaction-sigil--dormant",
    available && !pulsing && "reaction-sigil--available",
    pulsing && "reaction-sigil--pulsing",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!available) {
    return (
      <div className={sigilClasses} aria-hidden="true">
        <div className="reaction-sigil__rune reaction-sigil__rune--depleted">
          ⟡
        </div>
      </div>
    );
  }

  return (
    <button
      className={sigilClasses}
      onClick={onClick}
      aria-label={`Declare reaction${pulsing ? " (action pending!)" : ""}`}
      title={pulsing ? "Action in progress - React now!" : "Reaction available"}
    >
      {/* Pulsing energy rings */}
      {pulsing && (
        <>
          <div className="reaction-sigil__ring reaction-sigil__ring--1" />
          <div className="reaction-sigil__ring reaction-sigil__ring--2" />
          <div className="reaction-sigil__ring reaction-sigil__ring--3" />
        </>
      )}

      {/* Central rune */}
      <div className="reaction-sigil__rune">⟡</div>

      {/* Label */}
      {label && (
        <div className="reaction-sigil__label">
          {pulsing && (
            <span className="reaction-sigil__label-emphasis">⚡ </span>
          )}
          {label}
          {pulsing && (
            <span className="reaction-sigil__label-emphasis"> ⚡</span>
          )}
        </div>
      )}

      {/* Particle effects for pulsing state */}
      {pulsing && (
        <div className="reaction-sigil__particles" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="reaction-sigil__particle"
              style={{
                transform: `rotate(${i * 45}deg) translateY(-40px)`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}
    </button>
  );
};

export default ReactionSigil;
