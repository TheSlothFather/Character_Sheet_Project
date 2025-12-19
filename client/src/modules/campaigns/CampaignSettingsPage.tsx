import React from "react";
import { useParams } from "react-router-dom";
import { listSharedSettings, type PlayerCampaignSetting } from "../../api/campaigns";

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1rem"
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h3 style={{ margin: 0 }}>Setting Info</h3>
        <p style={{ margin: "0.25rem 0 0", color: "#94a3b8" }}>
          Notes your GM has shared for this campaign.
        </p>
      </header>
      {error && <div style={{ color: "#fca5a5" }}>{error}</div>}
      {loading ? (
        <div style={{ color: "#94a3b8" }}>Loading setting notes...</div>
      ) : settings.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>No shared setting notes yet.</div>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {settings.map((entry) => (
            <div key={entry.id} style={cardStyle}>
              <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>{entry.title}</div>
              {entry.tags && entry.tags.length > 0 && (
                <div style={{ color: "#9ca3af", fontSize: 13, marginBottom: "0.5rem" }}>
                  {entry.tags.join(" · ")}
                </div>
              )}
              {entry.body ? (
                <p style={{ margin: 0, color: "#cbd5e1" }}>{entry.body}</p>
              ) : (
                <p style={{ margin: 0, color: "#94a3b8" }}>No details provided.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
