import React from "react";

interface Campaign {
  id: string;
  name: string;
  joinCode: string;
}

export const CampaignsPage: React.FC = () => {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then(setCampaigns)
      .catch(() => {});
  }, []);

  const onCreate = async () => {
    if (!name.trim()) return;
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!res.ok) return;
    const created = (await res.json()) as Campaign;
    setCampaigns((prev) => [...prev, created]);
    setName("");
  };

  return (
    <div>
      <h2>Campaigns</h2>
      <div style={{ marginBottom: "1rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New campaign name"
        />
        <button onClick={onCreate} style={{ marginLeft: 8 }}>
          Create
        </button>
      </div>
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

