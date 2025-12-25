/**
 * RollOverlay Component - Unified Roll Experience
 *
 * Arcane war table where fate is decided through dice and skill.
 * Handles initiative, skill checks, and attack/defense contests
 * with dramatic animations and clear result communication.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { CombatEntity, SkillCheckRequest, SkillContestRequest, CriticalTier } from '@shared/rules/combat';
import './RollOverlay.css';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface DiceRoll {
  diceCount: number;
  diceSize: number;
  rawValues: number[];
  keepHighest: boolean;
  modifier: number;
}

export type RollSubmitData =
  | { variant: 'initiative'; roll: DiceRoll }
  | { variant: 'skill-check'; checkId: string; roll: DiceRoll }
  | { variant: 'contest'; contestId: string; skill: string; roll: DiceRoll };

export interface RollOverlayProps {
  isOpen: boolean;
  variant: 'initiative' | 'skill-check' | 'contest';

  // Entity performing the roll
  entity: CombatEntity;

  // For skill-check variant
  checkRequest?: SkillCheckRequest;

  // For contest variant
  contest?: SkillContestRequest;
  entities?: CombatEntity[];
  contestMode?: 'initiator' | 'defender' | 'spectator';

  // Callbacks
  onSubmit: (data: RollSubmitData) => void;
  onClose: () => void;
}

interface RollResult {
  rawValues: number[];
  selectedValue: number;
  modifier: number;
  total: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL TIER CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const CRITICAL_TIER_CONFIG: Record<CriticalTier, { label: string; rune: string; color: string }> = {
  normal: { label: 'Success', rune: '✓', color: '#D4AF37' },
  wicked: { label: 'Wicked Strike', rune: '⚡', color: '#FFD700' },
  vicious: { label: 'Vicious Blow', rune: '⚡⚡', color: '#FFA500' },
  brutal: { label: 'BRUTAL DEVASTATION', rune: '⚡⚡⚡', color: '#FF4500' },
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const RollOverlay: React.FC<RollOverlayProps> = ({
  isOpen,
  variant,
  entity,
  checkRequest,
  contest,
  entities = [],
  contestMode = 'spectator',
  onSubmit,
  onClose,
}) => {
  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────

  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [diceCount, setDiceCount] = useState(2);
  const [keepHighest, setKeepHighest] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const [rollResult, setRollResult] = useState<RollResult | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED DATA
  // ─────────────────────────────────────────────────────────────────────────

  // Opponent entity (for contests)
  const opponentEntity = contest && entities
    ? entities.find(e =>
        contestMode === 'initiator'
          ? e.id === contest.targetId
          : e.id === contest.initiatorId
      )
    : null;

  // Determine default skill
  const defaultSkill = variant === 'initiative'
    ? (entity.initiativeSkill || 'initiative')
    : variant === 'skill-check'
    ? (checkRequest?.skill || '')
    : contest?.initiatorSkill || '';

  // Get skill modifier
  const skillModifier = entity.skills[selectedSkill || defaultSkill] || 0;

  // Get roll title
  const rollTitle = variant === 'initiative'
    ? 'Roll Initiative'
    : variant === 'skill-check'
    ? `Skill Check: ${defaultSkill}`
    : contestMode === 'initiator'
    ? `Attack: ${defaultSkill}`
    : 'Defend Yourself';

  // Can the player select skill?
  const canSelectSkill = variant === 'contest' && contestMode === 'defender';

  // ─────────────────────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  // Reset state when overlay opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSkill(defaultSkill);
      setDiceCount(2);
      setKeepHighest(true);
      setRollResult(null);
      setIsRolling(false);
    }
  }, [isOpen, defaultSkill]);

  // Keyboard handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (!rollResult && variant !== 'contest') {
        onClose();
      }
    } else if (e.key === ' ' && !rollResult && !isRolling) {
      e.preventDefault();
      handleRoll();
    } else if (e.key === 'Enter' && rollResult) {
      e.preventDefault();
      handleConfirm();
    }
  }, [isOpen, rollResult, isRolling, variant]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleRoll = () => {
    setIsRolling(true);

    // Simulate dice animation delay
    setTimeout(() => {
      const rawValues = Array.from({ length: diceCount }, () =>
        Math.floor(Math.random() * 100) + 1
      );
      const selectedValue = keepHighest
        ? Math.max(...rawValues)
        : Math.min(...rawValues);
      const total = selectedValue + skillModifier;

      setRollResult({
        rawValues,
        selectedValue,
        modifier: skillModifier,
        total,
      });
      setIsRolling(false);
    }, 800);
  };

  const handleConfirm = () => {
    if (!rollResult) return;

    const roll: DiceRoll = {
      diceCount,
      diceSize: 100,
      rawValues: rollResult.rawValues,
      keepHighest,
      modifier: rollResult.modifier,
    };

    if (variant === 'initiative') {
      onSubmit({ variant: 'initiative', roll });
    } else if (variant === 'skill-check' && checkRequest) {
      onSubmit({ variant: 'skill-check', checkId: checkRequest.checkId, roll });
    } else if (variant === 'contest' && contest) {
      onSubmit({
        variant: 'contest',
        contestId: contest.contestId,
        skill: selectedSkill || defaultSkill,
        roll,
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  const renderEntityCard = (cardEntity: CombatEntity, side: 'left' | 'right' | 'center') => (
    <div className={`roll-overlay__entity-card roll-overlay__entity-card--${side}`}>
      <div className="roll-overlay__entity-portrait">
        <div className="roll-overlay__entity-avatar">
          {cardEntity.name.charAt(0)}
        </div>
      </div>
      <div className="roll-overlay__entity-info">
        <h3 className="roll-overlay__entity-name">{cardEntity.name}</h3>
        <div className="roll-overlay__entity-stats">
          <div className="roll-overlay__stat">
            <span className="roll-overlay__stat-icon">❤️</span>
            <span className="roll-overlay__stat-value">
              {cardEntity.energy.current}/{cardEntity.energy.max}
            </span>
          </div>
          <div className="roll-overlay__stat">
            <span className="roll-overlay__stat-icon">⚡</span>
            <span className="roll-overlay__stat-value">
              {cardEntity.ap.current}/{cardEntity.ap.max}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDiceArena = () => (
    <div className="roll-overlay__dice-arena">
      {isRolling && (
        <div className="roll-overlay__dice-particles">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="roll-overlay__particle"
              style={{ '--particle-index': i } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {rollResult ? (
        <div className="roll-overlay__result">
          <div className="roll-overlay__dice-display">
            {rollResult.rawValues.map((value, i) => (
              <div
                key={i}
                className={`roll-overlay__die ${
                  value === rollResult.selectedValue ? 'roll-overlay__die--selected' : ''
                }`}
              >
                {value}
              </div>
            ))}
          </div>
          <div className="roll-overlay__calculation">
            <span className="roll-overlay__calc-die">{rollResult.selectedValue}</span>
            <span className="roll-overlay__calc-operator">+</span>
            <span className="roll-overlay__calc-modifier">{rollResult.modifier}</span>
            <span className="roll-overlay__calc-equals">=</span>
            <span className="roll-overlay__calc-total">{rollResult.total}</span>
          </div>
        </div>
      ) : (
        <div className="roll-overlay__dice-prompt">
          <div className="roll-overlay__dice-icon">🎲</div>
          <p className="roll-overlay__dice-label">
            {isRolling ? 'Rolling...' : 'Ready to roll'}
          </p>
        </div>
      )}
    </div>
  );

  const renderContestResult = () => {
    if (!contest || contest.status !== 'resolved' || !contest.outcome) return null;

    const tier = contest.outcome.criticalTier || 'normal';
    const config = CRITICAL_TIER_CONFIG[tier];
    const winnerId = contest.outcome.winnerId;
    const isPlayerWinner = winnerId === entity.id;
    const margin = Math.abs(contest.outcome.winnerTotal - contest.outcome.loserTotal);

    return (
      <div className={`roll-overlay__contest-result roll-overlay__contest-result--${tier}`}>
        <div className="roll-overlay__contest-result-rune">{config.rune}</div>
        <h3 className="roll-overlay__contest-result-title">
          {isPlayerWinner ? config.label : 'Defeated'}
        </h3>
        <p className="roll-overlay__contest-result-margin">
          Margin: {margin}
        </p>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const isContest = variant === 'contest';
  const hasTargetNumber = variant === 'skill-check' && checkRequest?.targetNumber;

  return (
    <div
      className={`roll-overlay roll-overlay--${variant}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !rollResult && variant !== 'contest') {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roll-overlay-title"
    >
      {/* Backdrop */}
      <div className="roll-overlay__backdrop" />

      {/* Arcane frame corners */}
      <div className="roll-overlay__frame-corners">
        <div className="roll-overlay__corner roll-overlay__corner--tl" />
        <div className="roll-overlay__corner roll-overlay__corner--tr" />
        <div className="roll-overlay__corner roll-overlay__corner--bl" />
        <div className="roll-overlay__corner roll-overlay__corner--br" />
      </div>

      {/* Content */}
      <div className="roll-overlay__content">
        {/* Header */}
        <header className="roll-overlay__header">
          <h2 id="roll-overlay-title" className="roll-overlay__title">
            {rollTitle}
          </h2>
          {hasTargetNumber && (
            <div className="roll-overlay__target-number">
              <span className="roll-overlay__target-label">Target:</span>
              <span className="roll-overlay__target-value">{checkRequest.targetNumber}</span>
            </div>
          )}
        </header>

        {/* Main arena */}
        <div className={`roll-overlay__arena ${isContest ? 'roll-overlay__arena--contest' : ''}`}>
          {isContest && opponentEntity ? (
            <>
              {/* Contest: Split screen */}
              {renderEntityCard(
                contestMode === 'initiator' ? entity : opponentEntity,
                'left'
              )}
              <div className="roll-overlay__contest-divider">
                <div className="roll-overlay__vs-badge">VS</div>
              </div>
              {renderEntityCard(
                contestMode === 'initiator' ? opponentEntity : entity,
                'right'
              )}
            </>
          ) : (
            /* Single entity */
            renderEntityCard(entity, 'center')
          )}

          {/* Dice arena */}
          {renderDiceArena()}

          {/* Contest result (if resolved) */}
          {renderContestResult()}
        </div>

        {/* Controls */}
        <div className="roll-overlay__controls">
          {/* Skill selector (for defenders) */}
          {canSelectSkill && (
            <div className="roll-overlay__skill-selector">
              <label htmlFor="defense-skill" className="roll-overlay__label">
                Defense Skill:
              </label>
              <select
                id="defense-skill"
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="roll-overlay__select"
                disabled={!!rollResult}
              >
                {Object.keys(entity.skills).map((skill) => (
                  <option key={skill} value={skill}>
                    {skill} ({entity.skills[skill] >= 0 ? '+' : ''}{entity.skills[skill]})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dice config */}
          {!rollResult && (
            <div className="roll-overlay__dice-config">
              <div className="roll-overlay__config-group">
                <label htmlFor="dice-count" className="roll-overlay__label">
                  Dice:
                </label>
                <select
                  id="dice-count"
                  value={diceCount}
                  onChange={(e) => setDiceCount(Number(e.target.value))}
                  className="roll-overlay__select roll-overlay__select--compact"
                >
                  {[1, 2, 3, 4].map(n => (
                    <option key={n} value={n}>{n}d100</option>
                  ))}
                </select>
              </div>

              <div className="roll-overlay__config-group">
                <label htmlFor="keep-mode" className="roll-overlay__label">
                  Keep:
                </label>
                <select
                  id="keep-mode"
                  value={keepHighest ? 'highest' : 'lowest'}
                  onChange={(e) => setKeepHighest(e.target.value === 'highest')}
                  className="roll-overlay__select roll-overlay__select--compact"
                >
                  <option value="highest">Highest</option>
                  <option value="lowest">Lowest</option>
                </select>
              </div>

              <div className="roll-overlay__modifier-display">
                Modifier: <span className="roll-overlay__modifier-value">
                  {skillModifier >= 0 ? '+' : ''}{skillModifier}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="roll-overlay__actions">
            {!rollResult ? (
              <>
                <button
                  onClick={handleRoll}
                  disabled={isRolling}
                  className="roll-overlay__button roll-overlay__button--primary"
                >
                  {isRolling ? 'Rolling...' : 'Roll Dice'}
                  {!isRolling && <kbd className="roll-overlay__hotkey">SPACE</kbd>}
                </button>
                {variant !== 'contest' && (
                  <button
                    onClick={onClose}
                    className="roll-overlay__button roll-overlay__button--secondary"
                  >
                    Cancel
                    <kbd className="roll-overlay__hotkey">ESC</kbd>
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={handleConfirm}
                className="roll-overlay__button roll-overlay__button--confirm"
              >
                Confirm Roll
                <kbd className="roll-overlay__hotkey">ENTER</kbd>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RollOverlay;
