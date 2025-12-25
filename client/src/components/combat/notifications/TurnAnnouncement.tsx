/**
 * TurnAnnouncement - War Chronicle Edition
 *
 * Arcane summoning circle that calls the player to action.
 * Full-viewport takeover with rotating runes and dramatic reveal.
 */

import React, { useEffect, useCallback } from 'react';
import './TurnAnnouncement.css';

export interface TurnAnnouncementProps {
  isVisible: boolean;
  entityName: string;
  ap: { current: number; max: number };
  energy: { current: number; max: number };
  onDismiss: () => void;
}

export const TurnAnnouncement: React.FC<TurnAnnouncementProps> = ({
  isVisible,
  entityName,
  ap,
  energy,
  onDismiss,
}) => {
  // Auto-dismiss after 2 seconds
  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isVisible, onDismiss]);

  // Keyboard handler - SPACE or ENTER to dismiss
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
    }
  }, [onDismiss]);

  useEffect(() => {
    if (!isVisible) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleKeyDown]);

  if (!isVisible) return null;

  return (
    <div
      className="turn-announcement"
      onClick={onDismiss}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="turn-announcement-title"
      aria-describedby="turn-announcement-description"
    >
      {/* Radial gradient background */}
      <div className="turn-announcement__backdrop" aria-hidden="true" />

      {/* Rotating rune circle */}
      <div className="turn-announcement__rune-circle" aria-hidden="true">
        {/* Outer ring */}
        <div className="turn-announcement__rune-ring turn-announcement__rune-ring--outer">
          {[...Array(8)].map((_, i) => (
            <div
              key={`outer-${i}`}
              className="turn-announcement__rune"
              style={{ '--rune-index': i } as React.CSSProperties}
            >
              ᚱ
            </div>
          ))}
        </div>

        {/* Inner ring */}
        <div className="turn-announcement__rune-ring turn-announcement__rune-ring--inner">
          {[...Array(6)].map((_, i) => (
            <div
              key={`inner-${i}`}
              className="turn-announcement__rune"
              style={{ '--rune-index': i } as React.CSSProperties}
            >
              ᛏ
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="turn-announcement__content">
        {/* Icon */}
        <div className="turn-announcement__icon" aria-hidden="true">
          ⚔️
        </div>

        {/* Title */}
        <h1
          id="turn-announcement-title"
          className="turn-announcement__title"
        >
          YOUR TURN
        </h1>

        {/* Entity name */}
        <div className="turn-announcement__entity">
          {entityName}
        </div>

        {/* Resources */}
        <div
          id="turn-announcement-description"
          className="turn-announcement__resources"
        >
          <div className="turn-announcement__resource">
            <span className="turn-announcement__resource-icon">⚡</span>
            <span className="turn-announcement__resource-value">
              {ap.current}/{ap.max}
            </span>
            <span className="turn-announcement__resource-label">
              Action Points
            </span>
          </div>

          <div className="turn-announcement__resource-divider" aria-hidden="true">
            •
          </div>

          <div className="turn-announcement__resource">
            <span className="turn-announcement__resource-icon">❤️</span>
            <span className="turn-announcement__resource-value">
              {energy.current}/{energy.max}
            </span>
            <span className="turn-announcement__resource-label">
              Energy
            </span>
          </div>
        </div>

        {/* Action hint */}
        <div className="turn-announcement__hint">
          <kbd className="turn-announcement__key">SPACE</kbd>
          <span>or click to continue</span>
        </div>
      </div>

      {/* Corner runes (decorative) */}
      <div className="turn-announcement__corner-runes" aria-hidden="true">
        <div className="turn-announcement__corner-rune turn-announcement__corner-rune--tl">ᚦ</div>
        <div className="turn-announcement__corner-rune turn-announcement__corner-rune--tr">ᚨ</div>
        <div className="turn-announcement__corner-rune turn-announcement__corner-rune--bl">ᛒ</div>
        <div className="turn-announcement__corner-rune turn-announcement__corner-rune--br">ᛖ</div>
      </div>

      {/* Pulsing energy lines */}
      <svg className="turn-announcement__energy-lines" aria-hidden="true">
        <defs>
          <radialGradient id="turn-energy-gradient">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle
          cx="50%"
          cy="50%"
          r="30%"
          fill="none"
          stroke="url(#turn-energy-gradient)"
          strokeWidth="2"
          className="turn-announcement__energy-ring turn-announcement__energy-ring--1"
        />
        <circle
          cx="50%"
          cy="50%"
          r="40%"
          fill="none"
          stroke="url(#turn-energy-gradient)"
          strokeWidth="1.5"
          className="turn-announcement__energy-ring turn-announcement__energy-ring--2"
        />
        <circle
          cx="50%"
          cy="50%"
          r="50%"
          fill="none"
          stroke="url(#turn-energy-gradient)"
          strokeWidth="1"
          className="turn-announcement__energy-ring turn-announcement__energy-ring--3"
        />
      </svg>
    </div>
  );
};

export default TurnAnnouncement;
