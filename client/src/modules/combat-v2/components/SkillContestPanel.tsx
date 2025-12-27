/**
 * Skill Contest Panel
 *
 * UI for initiating and responding to skill contests in combat-v2.
 * Both GMs and players can use this to challenge each other with skill rolls.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useCombat } from "../context/CombatProvider";
import type { CombatV2Entity, PendingSkillContest } from "../../../api/combatV2Socket";
import { SKILL_ATTRIBUTE_MAP } from "../../characters/skillMetadata";

// All available skills for selection
const ALL_SKILLS = Object.keys(SKILL_ATTRIBUTE_MAP).sort();

// Format skill name for display
function formatSkillName(skillCode: string): string {
  return skillCode
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

// Roll d100 dice
function rollD100Dice(
  count: number,
  keepHighest: boolean
): { rawRolls: number[]; selectedRoll: number } {
  const rawRolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rawRolls.push(Math.floor(Math.random() * 100) + 1);
  }
  const selectedRoll = keepHighest ? Math.max(...rawRolls) : Math.min(...rawRolls);
  return { rawRolls, selectedRoll };
}

interface SkillContestPanelProps {
  isGM?: boolean;
}

export function SkillContestPanel({ isGM = false }: SkillContestPanelProps) {
  const { state, actions, canControlEntity } = useCombat();
  const { entities, pendingSkillContests, activeContest, lastContestResult } = state;

  // Initiation form state
  const [initiatorId, setInitiatorId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [selectedSkill, setSelectedSkill] = useState<string>("");
  const [diceCount, setDiceCount] = useState(1);
  const [keepHighest, setKeepHighest] = useState(true);
  const [isInitiating, setIsInitiating] = useState(false);

  // Response form state (for pending contests)
  const [selectedContestId, setSelectedContestId] = useState<string>("");
  const [responseSkill, setResponseSkill] = useState<string>("");
  const [responseDiceCount, setResponseDiceCount] = useState(1);
  const [responseKeepHighest, setResponseKeepHighest] = useState(true);

  // Get controllable entities
  const controllableEntities = useMemo(() => {
    return Object.values(entities).filter((e) => canControlEntity(e.id));
  }, [entities, canControlEntity]);

  // All entities for target selection
  const allEntities = useMemo(() => Object.values(entities), [entities]);

  // Get skill modifier from entity
  const getSkillModifier = useCallback(
    (entityId: string, skillCode: string): number => {
      const entity = entities[entityId];
      if (!entity?.skills) return 0;
      // Check both uppercase and the exact code
      return entity.skills[skillCode] ?? entity.skills[skillCode.toLowerCase()] ?? 0;
    },
    [entities]
  );

  // Handle initiating a contest
  const handleInitiate = useCallback(() => {
    if (!initiatorId || !selectedSkill) return;

    const skillModifier = getSkillModifier(initiatorId, selectedSkill);
    const { rawRolls, selectedRoll } = rollD100Dice(diceCount, keepHighest);

    // Get target player ID if target is player-controlled
    const targetEntity = targetId ? entities[targetId] : undefined;
    const targetPlayerId = targetEntity?.controller?.startsWith("player:")
      ? targetEntity.controller.replace("player:", "")
      : undefined;

    actions.initiateSkillContest({
      initiatorEntityId: initiatorId,
      targetEntityId: targetId || undefined,
      targetPlayerId,
      skill: selectedSkill,
      skillModifier,
      diceCount,
      keepHighest,
      rawRolls,
      selectedRoll,
    });

    // Reset form
    setSelectedSkill("");
    setTargetId("");
    setIsInitiating(false);
  }, [
    initiatorId,
    targetId,
    selectedSkill,
    diceCount,
    keepHighest,
    entities,
    getSkillModifier,
    actions,
  ]);

  // Handle responding to a contest
  const handleRespond = useCallback(() => {
    const contest = pendingSkillContests.find((c) => c.contestId === selectedContestId);
    if (!contest || !responseSkill) return;

    const skillModifier = getSkillModifier(contest.targetEntityId, responseSkill);
    const { rawRolls, selectedRoll } = rollD100Dice(responseDiceCount, responseKeepHighest);

    actions.respondToSkillContest({
      contestId: contest.contestId,
      entityId: contest.targetEntityId,
      skill: responseSkill,
      skillModifier,
      diceCount: responseDiceCount,
      keepHighest: responseKeepHighest,
      rawRolls,
      selectedRoll,
    });

    // Reset form
    setSelectedContestId("");
    setResponseSkill("");
  }, [
    selectedContestId,
    responseSkill,
    responseDiceCount,
    responseKeepHighest,
    pendingSkillContests,
    getSkillModifier,
    actions,
  ]);

  // Selected contest for response
  const selectedContest = pendingSkillContests.find((c) => c.contestId === selectedContestId);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-4">
      <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2">
        <span>Skill Contests</span>
        {pendingSkillContests.length > 0 && (
          <span className="px-2 py-0.5 text-xs bg-red-600 text-red-100 rounded-full">
            {pendingSkillContests.length} pending
          </span>
        )}
      </h2>

      {/* Active Contest Display */}
      {activeContest && (
        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
          <div className="text-sm text-amber-200 mb-2">Active Contest</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-amber-100">{activeContest.initiatorName}</div>
              <div className="text-xs text-amber-300">{formatSkillName(activeContest.initiatorSkill)}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-100">{activeContest.initiatorTotal}</div>
              <div className="text-xs text-amber-400">
                {activeContest.initiatorRawRolls.join(", ")} + {activeContest.initiatorSkillModifier}
              </div>
            </div>
            {activeContest.targetEntityId && (
              <div className="text-right">
                <div className="font-medium text-slate-300">{activeContest.targetName}</div>
                <div className="text-xs text-slate-400">Awaiting response...</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last Contest Result */}
      {lastContestResult && (
        <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-3">
          <div className="text-sm text-slate-400 mb-2">Last Result</div>
          <div className="flex items-center justify-between">
            <div className={lastContestResult.winnerEntityId === lastContestResult.initiatorEntityId ? "text-green-400" : "text-slate-400"}>
              <div className="font-medium">{lastContestResult.initiatorName}</div>
              <div className="text-lg font-bold">{lastContestResult.initiatorTotal}</div>
            </div>
            <div className="text-center">
              {lastContestResult.isTie ? (
                <span className="text-amber-400 font-bold">TIE</span>
              ) : (
                <span className="text-xs text-slate-500">vs</span>
              )}
            </div>
            <div className={lastContestResult.winnerEntityId === lastContestResult.defenderEntityId ? "text-green-400 text-right" : "text-slate-400 text-right"}>
              <div className="font-medium">{lastContestResult.defenderName}</div>
              <div className="text-lg font-bold">{lastContestResult.defenderTotal}</div>
            </div>
          </div>
          {lastContestResult.winnerName && (
            <div className="mt-2 text-center text-green-400 font-medium">
              {lastContestResult.winnerName} wins by {lastContestResult.margin}!
            </div>
          )}

          {/* Attack contest result details */}
          {lastContestResult.attack && (
            <div className="mt-3 bg-slate-800/60 rounded-lg p-3 space-y-2">
              {lastContestResult.attack.hit ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Attack Result</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded font-bold ${
                        lastContestResult.attack.criticalType === "brutal"
                          ? "bg-red-700 text-red-100"
                          : lastContestResult.attack.criticalType === "vicious"
                          ? "bg-orange-700 text-orange-100"
                          : lastContestResult.attack.criticalType === "wicked"
                          ? "bg-amber-700 text-amber-100"
                          : "bg-slate-600 text-slate-200"
                      }`}
                    >
                      {lastContestResult.attack.criticalType === "normal"
                        ? "Hit"
                        : `${lastContestResult.attack.criticalType.charAt(0).toUpperCase()}${lastContestResult.attack.criticalType.slice(1)} Critical`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-slate-400">
                      Damage:{" "}
                      <span className="text-red-400 font-bold">
                        {lastContestResult.attack.finalDamage}
                      </span>
                      <span className="text-slate-500 text-xs ml-1">
                        ({lastContestResult.attack.baseDamage} + {lastContestResult.attack.physicalAttribute}
                        {lastContestResult.attack.criticalType !== "normal" &&
                          lastContestResult.attack.criticalType !== "wicked" &&
                          ` ×${lastContestResult.attack.criticalType === "vicious" ? "1.5" : "2"}`}
                        )
                      </span>
                    </div>
                    <div className="text-slate-400 text-right">
                      Type: <span className="text-amber-300 capitalize">{lastContestResult.attack.damageType}</span>
                    </div>
                  </div>
                  {lastContestResult.attack.woundsDealt > 0 && (
                    <div className="text-center text-red-400 font-medium">
                      {lastContestResult.attack.woundsDealt} Wound{lastContestResult.attack.woundsDealt > 1 ? "s" : ""} Inflicted!
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center text-green-400 font-medium">Attack Missed!</div>
              )}
            </div>
          )}

          <button
            onClick={() => actions.clearContest()}
            className="mt-2 w-full px-3 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pending Contests (need response) */}
      {pendingSkillContests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-400">Respond to Challenge</h3>
          {pendingSkillContests.map((contest) => (
            <div
              key={contest.contestId}
              onClick={() => setSelectedContestId(contest.contestId)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedContestId === contest.contestId
                  ? "bg-red-900/40 border border-red-600"
                  : "bg-slate-700/50 border border-slate-600 hover:border-red-600/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-200">{contest.initiatorName}</span>
                    {(contest.isAttack || contest.contestType === "attack") && (
                      <span className="px-1.5 py-0.5 text-xs bg-red-700 text-red-100 rounded">
                        Attack
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">{formatSkillName(contest.initiatorSkill)}</div>
                </div>
                <div className="text-xl font-bold text-red-400">{contest.initiatorTotal}</div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                vs {entities[contest.targetEntityId]?.name ?? "Unknown"}
              </div>
            </div>
          ))}

          {/* Response form */}
          {selectedContest && (
            <div className="bg-slate-700/30 rounded-lg p-3 space-y-3">
              <div className="text-sm text-slate-300">
                Respond as <span className="text-amber-400">{entities[selectedContest.targetEntityId]?.name}</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400">Defense Skill</label>
                <select
                  value={responseSkill}
                  onChange={(e) => setResponseSkill(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
                >
                  <option value="">Select a skill...</option>
                  {ALL_SKILLS.map((skill) => (
                    <option key={skill} value={skill}>
                      {formatSkillName(skill)} (+{getSkillModifier(selectedContest.targetEntityId, skill)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Dice</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={responseDiceCount}
                    onChange={(e) => setResponseDiceCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Keep</label>
                  <select
                    value={responseKeepHighest ? "high" : "low"}
                    onChange={(e) => setResponseKeepHighest(e.target.value === "high")}
                    className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
                  >
                    <option value="high">Highest</option>
                    <option value="low">Lowest</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRespond}
                disabled={!responseSkill}
                className="w-full px-4 py-2 rounded bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-red-100 font-medium transition-colors"
              >
                Roll Defense
              </button>
            </div>
          )}
        </div>
      )}

      {/* Initiate Contest Form */}
      <div className="border-t border-slate-700 pt-4">
        {!isInitiating ? (
          <button
            onClick={() => setIsInitiating(true)}
            className="w-full px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-amber-100 font-medium transition-colors"
          >
            Start Skill Contest
          </button>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-amber-400">Initiate Contest</h3>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">Initiator</label>
              <select
                value={initiatorId}
                onChange={(e) => setInitiatorId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
              >
                <option value="">Select entity...</option>
                {controllableEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.displayName || entity.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">Target (optional)</label>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
              >
                <option value="">No target (skill check)</option>
                {allEntities
                  .filter((e) => e.id !== initiatorId)
                  .map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.displayName || entity.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">Skill</label>
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
              >
                <option value="">Select a skill...</option>
                {ALL_SKILLS.map((skill) => (
                  <option key={skill} value={skill}>
                    {formatSkillName(skill)}
                    {initiatorId && ` (+${getSkillModifier(initiatorId, skill)})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Dice Count</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={diceCount}
                  onChange={(e) => setDiceCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Keep</label>
                <select
                  value={keepHighest ? "high" : "low"}
                  onChange={(e) => setKeepHighest(e.target.value === "high")}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-slate-200"
                >
                  <option value="high">Highest</option>
                  <option value="low">Lowest</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleInitiate}
                disabled={!initiatorId || !selectedSkill}
                className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-green-100 font-medium transition-colors"
              >
                Roll & Send
              </button>
              <button
                onClick={() => setIsInitiating(false)}
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SkillContestPanel;
