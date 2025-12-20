import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CharactersPage } from "../characters/CharactersPage";
import "./CampaignCharactersPage.css";

export const CampaignCharactersPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();

  if (!campaignId) {
    return <div className="campaign-characters__error body">Campaign ID missing.</div>;
  }

  return (
    <div className="campaign-characters">
      <div className="campaign-characters__header">
        <div>
          <h3 className="campaign-characters__title h2">Campaign Characters</h3>
          <p className="campaign-characters__subtitle subtitle muted">
            Create and manage characters tied to this campaign only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/player/character-creation?campaignId=${campaignId}`)}
          className="campaign-characters__button"
        >
          Create Character
        </button>
      </div>
      <CharactersPage campaignId={campaignId} />
    </div>
  );
};
