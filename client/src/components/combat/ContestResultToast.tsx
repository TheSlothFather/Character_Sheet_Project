/**
 * ContestResultToast Component
 *
 * Brief notification toast for players showing skill contest results.
 * Auto-dismisses after a short duration.
 * Shows only the final outcome, not all the roll details.
 */

import React from "react";
import type { CombatEntity } from "@shared/rules/combat";

export interface ContestResult {
  contestId: string;
  winnerId: string | null;
  loserId: string | null;
  winnerTotal: number;
  loserTotal: number;
  criticalTier: "normal" | "wicked" | "vicious" | "brutal";
  isTie: boolean;
}

export interface ContestResultToastProps {
  result: ContestResult;
  entities: Record<string, CombatEntity>;
  onDismiss: () => void;
  autoDismissMs?: number;
  className?: string;
}

export const ContestResultToast: React.FC<ContestResultToastProps> = ({
  result,
  entities,
  onDismiss,
  autoDismissMs = 5000,
  className = "",
}) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  const winner = result.winnerId ? entities[result.winnerId] : null;
  const loser = result.loserId ? entities[result.loserId] : null;

  const getTierLabel = (tier: ContestResult['criticalTier']): string => {
    switch (tier) {
      case 'wicked': return 'Wicked!';
      case 'vicious': return 'Vicious!';
      case 'brutal': return 'Brutal!';
      default: return '';
    }
  };

  const getTierClass = (tier: ContestResult['criticalTier']): string => {
    switch (tier) {
      case 'wicked': return 'tier-wicked';
      case 'vicious': return 'tier-vicious';
      case 'brutal': return 'tier-brutal';
      default: return '';
    }
  };

  return (
    <div
      className={`contest-result-toast ${getTierClass(result.criticalTier)} ${className}`}
      onClick={onDismiss}
    >
      <div className="toast-content">
        {result.isTie ? (
          <>
            <div className="contest-header">Contest Tie!</div>
            <div className="contest-details">
              {winner?.displayName || winner?.name} vs {loser?.displayName || loser?.name}
            </div>
            <div className="contest-totals">
              Both rolled {result.winnerTotal}
            </div>
          </>
        ) : (
          <>
            <div className="contest-header">
              {winner?.displayName || winner?.name} Wins
              {result.criticalTier !== 'normal' && (
                <span className="tier-badge">{getTierLabel(result.criticalTier)}</span>
              )}
            </div>
            <div className="contest-details">
              vs {loser?.displayName || loser?.name}
            </div>
            <div className="contest-totals">
              {result.winnerTotal} vs {result.loserTotal}
            </div>
          </>
        )}
      </div>
      <div className="toast-dismiss-hint">Click to dismiss</div>
    </div>
  );
};

export default ContestResultToast;
