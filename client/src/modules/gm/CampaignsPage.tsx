import React from "react";
import { Link } from "react-router-dom";
import { gmApi, type Campaign, type CampaignInvite } from "../../api/gm";
import "./CampaignsPage.css";

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
    <div className="gm-campaigns">
      <header>
        <h2 className="gm-campaigns__title h2">Campaigns</h2>
        <p className="gm-campaigns__subtitle subtitle muted">
          Create a campaign and share an invite link with players.
        </p>
      </header>

      <section className="gm-campaigns__card">
        <h3 className="gm-campaigns__card-title h3">Create Campaign</h3>
        <form onSubmit={handleCreate} className="gm-campaigns__form">
          <label className="gm-campaigns__field">
            <span className="gm-campaigns__label">Campaign Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Crimson Coast"
              className="gm-campaigns__input"
            />
          </label>
          <button
            type="submit"
            className="gm-campaigns__button gm-campaigns__button--primary"
          >
            Create Campaign
          </button>
        </form>
      </section>

      <section className="gm-campaigns__card">
        <h3 className="gm-campaigns__card-title h3">Active Campaigns</h3>
        {error && <div className="gm-campaigns__message gm-campaigns__message--error">{error}</div>}
        {copyNotice && <div className="gm-campaigns__message gm-campaigns__message--success">{copyNotice}</div>}
        {loading ? (
          <p className="gm-campaigns__muted body muted">Loading campaigns...</p>
        ) : campaigns.length === 0 ? (
          <p className="gm-campaigns__muted body muted">No campaigns yet. Create one above.</p>
        ) : (
          <div className="gm-campaigns__list">
            {campaigns.map((campaign) => {
              const invite = inviteByCampaign[campaign.id];
              const link = invite ? buildInviteLink(invite.token) : null;
              return (
                <div key={campaign.id} className="gm-campaigns__item">
                  <div className="gm-campaigns__item-header">
                    <div>
                      <div className="gm-campaigns__item-title">{campaign.name}</div>
                      {campaign.createdAt && (
                        <div className="gm-campaigns__item-meta">
                          Created {new Date(campaign.createdAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <span className="gm-campaigns__status">
                      {invite ? "INVITE READY" : "NO INVITE"}
                    </span>
                  </div>
                  <div className="gm-campaigns__invite-row">
                    <span className="gm-campaigns__invite-label">Invite Link:</span>
                    <span className="gm-campaigns__invite-value">{link ?? "Generate an invite to share."}</span>
                  </div>
                  <div className="gm-campaigns__actions">
                    <Link to={`/gm/campaigns/${campaign.id}`} className="gm-campaigns__button gm-campaigns__button--primary">
                      Open Campaign
                    </Link>
                    <button
                      type="button"
                      onClick={() => link && handleCopy(link)}
                      disabled={!link}
                      className="gm-campaigns__button gm-campaigns__button--neutral"
                    >
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotateLink(campaign.id)}
                      className="gm-campaigns__button gm-campaigns__button--danger"
                    >
                      Regenerate Link
                    </button>
                    {!invite && (
                      <button
                        type="button"
                        onClick={() => handleCreateInvite(campaign.id)}
                        className="gm-campaigns__button gm-campaigns__button--primary"
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
