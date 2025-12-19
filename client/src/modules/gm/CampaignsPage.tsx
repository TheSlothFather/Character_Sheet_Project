import React from "react";

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

type Campaign = {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  createdAt: string;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `campaign-${Math.random().toString(36).slice(2, 10)}`;
};

const createInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const buildInviteLink = (inviteCode: string) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://adurun.app";
  return `${origin}/gm/join/${inviteCode}`;
};

export const CampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const newCampaign: Campaign = {
      id: createId(),
      name: trimmed,
      description: description.trim(),
      inviteCode: createInviteCode(),
      createdAt: new Date().toLocaleDateString()
    };
    setCampaigns((prev) => [newCampaign, ...prev]);
    setName("");
    setDescription("");
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

  const handleRotateLink = (id: string) => {
    setCampaigns((prev) =>
      prev.map((campaign) =>
        campaign.id === id
          ? {
              ...campaign,
              inviteCode: createInviteCode()
            }
          : campaign
      )
    );
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
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="High seas intrigue and forgotten gods."
              style={{ ...inputStyle, resize: "vertical" }}
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
        {copyNotice && <div style={{ marginBottom: 8, color: "#9ae6b4" }}>{copyNotice}</div>}
        {campaigns.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No campaigns yet. Create one above.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {campaigns.map((campaign) => {
              const link = buildInviteLink(campaign.inviteCode);
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
                      <div style={{ color: "#9ca3af", fontSize: 13 }}>Created {campaign.createdAt}</div>
                    </div>
                    <span style={{ color: "#9ae6b4", fontSize: 12, fontWeight: 700 }}>INVITE READY</span>
                  </div>
                  {campaign.description && (
                    <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{campaign.description}</p>
                  )}
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
                    <span style={{ color: "#e5e7eb" }}>{link}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => handleCopy(link)}
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
