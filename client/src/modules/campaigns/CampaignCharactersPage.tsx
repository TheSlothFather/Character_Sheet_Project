import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CharactersPage } from "../characters/CharactersPage";

export const CampaignCharactersPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  if (!campaignId) {
    return <div style={{ color: "#fca5a5" }}>Campaign ID missing.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Campaign Characters</h3>
          <p style={{ margin: "0.25rem 0 0", color: "#94a3b8" }}>
            Create and manage characters tied to this campaign only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/player/character-creation?campaignId=${campaignId}`)}
          style={{
            padding: "0.55rem 0.85rem",
            borderRadius: 8,
            border: "1px solid #1d4ed8",
            background: "#2563eb",
            color: "#e6edf7",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Create Character
        </button>
      </div>
      <CharactersPage campaignId={campaignId} />
    </div>
  );
};
