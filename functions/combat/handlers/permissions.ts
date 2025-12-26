/**
 * Combat permissions helpers
 *
 * Centralized controller checks for combat actions.
 */

import type { WebSocketMetadata } from "../CombatDurableObject";

export function canControlEntity(
  session: WebSocketMetadata,
  entityId: string,
  entityData?: { controller?: string }
): boolean {
  if (session.isGM) return true;

  const controller = entityData?.controller;
  if (typeof controller === "string" && controller.startsWith("player:")) {
    return controller === `player:${session.playerId}`;
  }

  return session.controlledEntityIds.includes(entityId);
}
