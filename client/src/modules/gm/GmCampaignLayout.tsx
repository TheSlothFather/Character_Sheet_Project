import React from "react";
import { Outlet, useParams } from "react-router-dom";
import { gmApi, type Campaign } from "../../api/gm";
import { isTestMode } from "../../test-utils/combat-v2/testMode";
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

    // TEST MODE: Skip campaign loading and use mock data
    if (isTestMode()) {
      setCampaign({ id: campaignId, name: "Test Campaign", gmUserId: "dev-gm-id" } as Campaign);
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
        <h2 className="gm-campaign__title h2">GM Campaign</h2>
        <p className="gm-campaign__subtitle subtitle muted">
          {loading ? "Loading campaign..." : campaign?.name || "Unnamed campaign"}
        </p>
        {error && <p className="gm-campaign__error body">{error}</p>}
      </header>
      <Outlet />
    </div>
  );
};
