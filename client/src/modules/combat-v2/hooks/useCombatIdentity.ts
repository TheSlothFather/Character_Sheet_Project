import { useEffect, useState } from "react";
import { gmApi } from "../../../api/gm";
import { getSupabaseClient } from "../../../api/supabaseClient";
import { isTestMode, getTestModeIdentity } from "../../../test-utils/combat-v2/testMode";

type CombatIdentity = {
  playerId: string | null;
  controlledCharacterIds: string[];
  loading: boolean;
  error: string | null;
};

export function useCombatIdentity(campaignId: string | undefined, isGM: boolean): CombatIdentity {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [controlledCharacterIds, setControlledCharacterIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadIdentity = async () => {
      // TEST MODE: Return mock identity without hitting Supabase
      if (isTestMode()) {
        const testIdentity = getTestModeIdentity();
        if (testIdentity) {
          if (!isActive) return;
          setPlayerId(testIdentity.playerId);
          setControlledCharacterIds(testIdentity.controlledCharacterIds);
          setLoading(false);
          setError(null);
          return;
        }
      }
      if (!campaignId) {
        if (!isActive) return;
        setLoading(false);
        return;
      }

      try {
        const client = getSupabaseClient();
        const { data, error: authError } = await client.auth.getUser();

        if (authError || !data.user) {
          throw new Error("Not authenticated");
        }

        if (!isActive) return;

        const userId = data.user.id;
        setPlayerId(userId);

        if (isGM) {
          setControlledCharacterIds([]);
          setError(null);
          return;
        }

        try {
          const members = await gmApi.listCampaignMembers(campaignId);

          if (!isActive) return;

          const characterIds = members
            .filter((member) => member.playerUserId === userId && member.characterId)
            .map((member) => member.characterId as string);

          setControlledCharacterIds(characterIds);
        } catch {
          if (!isActive) return;
          setControlledCharacterIds([]);
        }

        setError(null);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Failed to load player data");
      } finally {
        if (!isActive) return;
        setLoading(false);
      }
    };

    loadIdentity();

    return () => {
      isActive = false;
    };
  }, [campaignId, isGM]);

  return { playerId, controlledCharacterIds, loading, error };
}
