import React from "react";
import { gmApi, type Campaign, type CampaignInvite } from "../../api/gm";

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1rem"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #2f3542",
  background: "#0b1017",
  color: "#e5e7eb",
  boxSizing: "border-box"
};

const buildInviteLink = (inviteCode: string) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://adurun.app";
  return `${origin}/join/${inviteCode}`;
};

export const CampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [name, setName] = React.useState("");
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);
  const [inviteByCampaign, setInviteByCampaign] = React.useState<Record<string, CampaignInvite | null>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadCampaigns = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listCampaigns();
        if (!active) return;
        setCampaigns(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load campaigns.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCampaigns();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const loadInvites = async () => {
      const inviteEntries = await Promise.all(
        campaigns.map(async (campaign) => {
          try {
            const invites = await gmApi.listCampaignInvites(campaign.id);
            return [campaign.id, invites[0] ?? null] as const;
          } catch {
            return [campaign.id, null] as const;
          }
        })
      );
      if (!active) return;
      setInviteByCampaign((prev) => {
        const next = { ...prev };
        inviteEntries.forEach(([campaignId, invite]) => {
          next[campaignId] = invite;
        });
        return next;
      });
    };
    if (campaigns.length > 0) {
      loadInvites();
    } else {
      setInviteByCampaign({});
    }
    return () => {
      active = false;
    };
  }, [campaigns]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await gmApi.createCampaign({ name: trimmed });
      setCampaigns((prev) => [created, ...prev]);
      setName("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create campaign.");
    }
  };

  const handleCopy = async (link: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      setCopyNotice("Invite link copied.");
      setTimeout(() => setCopyNotice(null), 2000);
      return;
    }
    setCopyNotice("Clipboard unavailable. Copy manually.");
  };

  const handleRotateLink = async (campaignId: string) => {
    setError(null);
    try {
      const existingInvite = inviteByCampaign[campaignId];
      if (existingInvite?.token) {
        await gmApi.revokeCampaignInvite(existingInvite.token);
      }
      const nextInvite = await gmApi.createCampaignInvite({ campaignId });
      setInviteByCampaign((prev) => ({ ...prev, [campaignId]: nextInvite }));
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Failed to regenerate invite.");
    }
  };

  const handleCreateInvite = async (campaignId: string) => {
    setError(null);
    try {
      const invite = await gmApi.createCampaignInvite({ campaignId });
      setInviteByCampaign((prev) => ({ ...prev, [campaignId]: invite }));
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Failed to create invite.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Campaigns</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Create a campaign and share an invite link with players.
        </p>
      </header>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Create Campaign</h3>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Campaign Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Crimson Coast"
              style={inputStyle}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: 8,
              border: "1px solid #1d4ed8",
              background: "#2563eb",
              color: "#e6edf7",
              fontWeight: 700,
              width: "fit-content",
              cursor: "pointer"
            }}
          >
            Create Campaign
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Active Campaigns</h3>
        {error && <div style={{ marginBottom: 8, color: "#fca5a5" }}>{error}</div>}
        {copyNotice && <div style={{ marginBottom: 8, color: "#9ae6b4" }}>{copyNotice}</div>}
        {loading ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Loading campaigns...</p>
        ) : campaigns.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No campaigns yet. Create one above.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {campaigns.map((campaign) => {
              const invite = inviteByCampaign[campaign.id];
              const link = invite ? buildInviteLink(invite.token) : null;
              return (
                <div
                  key={campaign.id}
                  style={{
                    border: "1px solid #1f2935",
                    borderRadius: 10,
                    padding: "0.75rem",
                    background: "#0c111a",
                    display: "grid",
                    gap: "0.5rem"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{campaign.name}</div>
                      {campaign.createdAt && (
                        <div style={{ color: "#9ca3af", fontSize: 13 }}>
                          Created {new Date(campaign.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <span style={{ color: "#9ae6b4", fontSize: 12, fontWeight: 700 }}>
                      {invite ? "INVITE READY" : "NO INVITE"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      alignItems: "center",
                      fontSize: 13
                    }}
                  >
                    <span style={{ color: "#9ca3af" }}>Invite Link:</span>
                    <span style={{ color: "#e5e7eb" }}>{link ?? "Generate an invite to share."}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => link && handleCopy(link)}
                      disabled={!link}
                      style={{
                        padding: "0.45rem 0.8rem",
                        borderRadius: 8,
                        border: "1px solid #2b3747",
                        background: "#1f2935",
                        color: "#e5e7eb",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotateLink(campaign.id)}
                      style={{
                        padding: "0.45rem 0.8rem",
                        borderRadius: 8,
                        border: "1px solid #3f2b2b",
                        background: "#2c1515",
                        color: "#fecaca",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Regenerate Link
                    </button>
                    {!invite && (
                      <button
                        type="button"
                        onClick={() => handleCreateInvite(campaign.id)}
                        style={{
                          padding: "0.45rem 0.8rem",
                          borderRadius: 8,
                          border: "1px solid #1d4ed8",
                          background: "#2563eb",
                          color: "#e6edf7",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Create Invite
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
