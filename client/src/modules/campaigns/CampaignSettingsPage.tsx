import React from "react";
import { useParams } from "react-router-dom";
import { listSharedSettings, type PlayerCampaignSetting } from "../../api/campaigns";
import "./CampaignSettingsPage.css";

export const CampaignSettingsPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [settings, setSettings] = React.useState<PlayerCampaignSetting[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!campaignId) {
      setError("Campaign ID missing.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listSharedSettings(campaignId);
        if (!active) return;
        setSettings(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load setting info.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSettings();

    return () => {
      active = false;
    };
  }, [campaignId]);

  return (
    <div className="campaign-settings">
      <header>
        <h3 className="campaign-settings__title h2">Setting Info</h3>
        <p className="campaign-settings__subtitle subtitle muted">
          Notes your GM has shared for this campaign.
        </p>
      </header>
      {error && <div className="campaign-settings__error body">{error}</div>}
      {loading ? (
        <div className="campaign-settings__status body muted">Loading setting notes...</div>
      ) : settings.length === 0 ? (
        <div className="campaign-settings__status body muted">No shared setting notes yet.</div>
      ) : (
        <div className="campaign-settings__list">
          {settings.map((entry) => (
            <div key={entry.id} className="campaign-settings__card">
              <div className="campaign-settings__card-title h3">{entry.title}</div>
              {entry.tags && entry.tags.length > 0 && (
                <div className="campaign-settings__tags caption muted">
                  {entry.tags.join(" · ")}
                </div>
              )}
              {entry.body ? (
                <p className="campaign-settings__body body">{entry.body}</p>
              ) : (
                <p className="campaign-settings__empty body muted">No details provided.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
