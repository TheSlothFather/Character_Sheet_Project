import React from "react";
import { NavLink, Outlet, useParams } from "react-router-dom";
import { getCampaign } from "../../api/campaigns";

const headerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem"
};

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  borderBottom: "1px solid #1f2935",
  paddingBottom: "0.75rem",
  flexWrap: "wrap"
};

const linkStyle: React.CSSProperties = {
  padding: "0.35rem 0.6rem",
  borderRadius: 8,
  textDecoration: "none",
  color: "#e5e7eb",
  border: "1px solid transparent"
};

const activeLinkStyle: React.CSSProperties = {
  borderColor: "#2563eb",
  background: "#111827",
  fontWeight: 700
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header style={headerStyle}>
        <h2 style={{ margin: 0 }}>Campaign Hub</h2>
        <p style={{ margin: 0, color: "#94a3b8" }}>
          {loading ? "Loading campaign..." : campaignName || "Unnamed campaign"}
        </p>
        {error && <p style={{ margin: 0, color: "#fca5a5" }}>{error}</p>}
      </header>
      <nav style={navStyle}>
        <NavLink
          to="characters"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Characters
        </NavLink>
        <NavLink
          to="settings"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Setting Info
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
};
