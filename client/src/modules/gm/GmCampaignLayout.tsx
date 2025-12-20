import React from "react";
import { Outlet, useParams } from "react-router-dom";
import { gmApi, type Campaign } from "../../api/gm";
import "./GmCampaignLayout.css";

export const GmCampaignLayout: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!campaignId) {
      setError("Campaign ID is missing.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadCampaign = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listCampaigns();
        if (!active) return;
        const match = data.find((item) => item.id === campaignId) ?? null;
        setCampaign(match);
        if (!match) {
          setError("Campaign not found.");
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load campaign.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCampaign();

    return () => {
      active = false;
    };
  }, [campaignId]);

  if (!campaignId) {
    return <div>Campaign not found.</div>;
  }

  return (
    <div className="gm-campaign">
      <header className="gm-campaign__header">
        <h2 className="gm-campaign__title">GM Campaign</h2>
        <p className="gm-campaign__subtitle">
          {loading ? "Loading campaign..." : campaign?.name || "Unnamed campaign"}
        </p>
        {error && <p className="gm-campaign__error">{error}</p>}
      </header>
      <Outlet />
    </div>
  );
};
