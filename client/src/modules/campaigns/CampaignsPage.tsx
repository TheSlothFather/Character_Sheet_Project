import React from "react";
import { api, Campaign, ApiError } from "../../api/client";

const isCampaign = (value: unknown): value is Campaign => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Campaign>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.joinCode === "string"
  );
};

const isCampaignArray = (value: unknown): value is Campaign[] =>
  Array.isArray(value) && value.every(isCampaign);

export const CampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .listCampaigns()
      .then((data) => {
        if (!isMounted) return;
        if (!isCampaignArray(data)) {
          throw new Error("Unexpected response when loading campaigns");
        }
        setCampaigns(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Failed to load campaigns";
        setError(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const onCreate = async () => {
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await api.createCampaign({ name: name.trim() });
      if (!created || !isCampaign(created)) {
        setError("Unexpected response when creating campaign.");
        return;
      }
      setCampaigns((prev) => [...prev, created]);
      setName("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create campaign";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Campaigns</h2>
      <div style={{ marginBottom: "1rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New campaign name"
          disabled={isSubmitting}
        />
        <button
          onClick={onCreate}
          style={{ marginLeft: 8 }}
          disabled={isSubmitting || !name.trim()}
        >
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </div>

      {loading && <p>Loading campaigns...</p>}
      {error && <p style={{ color: "#f55" }}>{error}</p>}

      {!loading && !error && campaigns.length === 0 && <p>No campaigns yet.</p>}

      <ul>
        {campaigns.map((c) => (
          <li key={c.id}>
            {c.name} (code {c.joinCode})
          </li>
        ))}
      </ul>
    </div>
  );
};
