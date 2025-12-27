import React from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { getCampaign } from "../../api/campaigns";
import { isTestMode } from "../../test-utils/combat-v2/testMode";
import "./CampaignHubLayout.css";

export const CampaignHubLayout: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaignName, setCampaignName] = React.useState<string>("");
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
      setCampaignName("Test Campaign");
      setLoading(false);
      return;
    }

    let active = true;
    const loadCampaign = async () => {
      setLoading(true);
      setError(null);
      try {
        const campaign = await getCampaign(campaignId);
        if (!active) return;
        setCampaignName(campaign.name);
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
    <div className="campaign-hub">
      <header className="campaign-hub__header">
        <h2 className="campaign-hub__title h2">Campaign Hub</h2>
        <p className="campaign-hub__subtitle subtitle muted">
          {loading ? "Loading campaign..." : campaignName || "Unnamed campaign"}
        </p>
        {error && <p className="campaign-hub__error body">{error}</p>}
      </header>
      <nav className="campaign-hub__nav">
        <NavLink
          to="characters"
          className={({ isActive }) => (isActive ? "campaign-hub__link campaign-hub__link--active" : "campaign-hub__link")}
        >
          Characters
        </NavLink>
        <NavLink
          to="combat"
          className={({ isActive }) => (isActive ? "campaign-hub__link campaign-hub__link--active" : "campaign-hub__link")}
        >
          Combat
        </NavLink>
        <NavLink
          to="settings"
          className={({ isActive }) => (isActive ? "campaign-hub__link campaign-hub__link--active" : "campaign-hub__link")}
        >
          Setting Info
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
};
